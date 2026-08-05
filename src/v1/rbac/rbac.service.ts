// src/v1/rbac/rbac.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleToUserDto,
  AssignAdminRoleDto,
} from './dto/role.dto';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateRbacCache(): Promise<void> {
    try {
      // Invalidate all RBAC tags
      await this.cacheService.invalidateByTag('rbac');
      await this.cacheService.invalidateByTag('permissions');
      await this.cacheService.invalidateByTag('roles');
      await this.cacheService.invalidateByTag('admins');
      await this.cacheService.invalidateByTag('user');

      // Invalidate specific cache keys
      await this.cacheService.delete('permissions:all');
      await this.cacheService.delete('admins:all');

      // Invalidate all patterns
      await this.cacheService.invalidatePattern('permission:*');
      await this.cacheService.invalidatePattern('roles:organization:*');
      await this.cacheService.invalidatePattern('role:*');
      await this.cacheService.invalidatePattern('user:permissions:*');

      this.logger.log('RBAC cache invalidated');
    } catch (error) {
      this.logger.error(`Failed to invalidate RBAC cache: ${error.message}`);
    }
  }

  // ============================================
  // PERMISSIONS
  // ============================================

  async getAllPermissions() {
    const cacheKey = 'permissions:all';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const permissions = await this.prisma.permission.findMany({
      orderBy: { category: 'asc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      permissions,
      ['rbac', 'permissions'],
      600,
    );

    return permissions;
  }

  async getPermissionByKey(key: string) {
    const cacheKey = `permission:${key}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const permission = await this.prisma.permission.findUnique({
      where: { key },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      permission,
      ['rbac', 'permissions'],
      600,
    );

    return permission;
  }

  // ============================================
  // ROLES
  // ============================================

  async createRole(userId: string, dto: CreateRoleDto) {
    this.logger.log(`Creating role: ${dto.name}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission to create roles
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: dto.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to create roles',
      );
    }

    const existing = await this.prisma.role.findFirst({
      where: {
        organizationId: dto.organizationId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Role with this name already exists in this organization',
      );
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: {
          organizationId: dto.organizationId,
          name: dto.name,
          description: dto.description,
          isSystem: dto.isSystem || false,
        },
      });

      // Assign permissions
      if (dto.permissions && dto.permissions.length > 0) {
        for (const permissionKey of dto.permissions) {
          const permission = await tx.permission.findUnique({
            where: { key: permissionKey },
          });

          if (permission) {
            await tx.rolePermission.create({
              data: {
                roleId: newRole.id,
                permissionId: permission.id,
              },
            });
          }
        }
      }

      return newRole;
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Role created: ${role.id}`);
    return role;
  }

  async getRolesByOrganization(organizationId: string) {
    const cacheKey = `roles:organization:${organizationId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.cacheService.setWithTag(cacheKey, roles, ['rbac', 'roles'], 300);

    return roles;
  }

  async getRoleById(roleId: string) {
    const cacheKey = `role:${roleId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        organization: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.cacheService.setWithTag(cacheKey, role, ['rbac', 'roles'], 300);

    return role;
  }

  async updateRole(roleId: string, userId: string, dto: UpdateRoleDto) {
    this.logger.log(`Updating role: ${roleId}`);

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { organization: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: role.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to update roles',
      );
    }

    // Don't allow updating system roles
    if (role.isSystem) {
      throw new ForbiddenException('Cannot update system roles');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRole = await tx.role.update({
        where: { id: roleId },
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      // Update permissions if provided
      if (dto.permissions) {
        // Remove existing permissions
        await tx.rolePermission.deleteMany({
          where: { roleId },
        });

        // Add new permissions
        for (const permissionKey of dto.permissions) {
          const permission = await tx.permission.findUnique({
            where: { key: permissionKey },
          });

          if (permission) {
            await tx.rolePermission.create({
              data: {
                roleId,
                permissionId: permission.id,
              },
            });
          }
        }
      }

      return updatedRole;
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Role updated: ${roleId}`);
    return updated;
  }

  async deleteRole(roleId: string, userId: string) {
    this.logger.log(`Deleting role: ${roleId}`);

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { organization: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: role.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete roles',
      );
    }

    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete system roles');
    }

    const deleted = await this.prisma.role.delete({
      where: { id: roleId },
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Role deleted: ${roleId}`);
    return deleted;
  }

  // ============================================
  // USER ROLE ASSIGNMENT
  // ============================================

  async assignRoleToUser(assignerId: string, dto: AssignRoleToUserDto) {
    this.logger.log(`Assigning role to user: ${dto.userId}`);

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is a member of the organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: dto.userId,
        organizationId: dto.organizationId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'User is not a member of this organization',
      );
    }

    // Check if assigner has permission
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId: assignerId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    const isOrgAdmin = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: assignerId,
        organizationId: dto.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (!isPlatformAdmin && !isOrgAdmin) {
      throw new ForbiddenException(
        'You do not have permission to assign roles',
      );
    }

    // Check if already assigned
    const existing = await this.prisma.membershipRole.findFirst({
      where: {
        membershipId: membership.id,
        roleId: dto.roleId,
      },
    });

    if (existing) {
      throw new ConflictException('User already has this role');
    }

    const assignment = await this.prisma.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: dto.roleId,
        assignedBy: assignerId,
        assignedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.invalidateRbacCache();
    await this.cacheService.delete(`user:permissions:${dto.userId}`);

    this.logger.log(`Role assigned to user: ${dto.userId}`);
    return assignment;
  }

  async removeRoleFromUser(membershipRoleId: string, userId: string) {
    this.logger.log(`Removing role from user`);

    const assignment = await this.prisma.membershipRole.findUnique({
      where: { id: membershipRoleId },
      include: {
        membership: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Role assignment not found');
    }

    // Check if user has permission
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    const isOrgAdmin = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: assignment.membership.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (!isPlatformAdmin && !isOrgAdmin) {
      throw new ForbiddenException(
        'You do not have permission to remove roles',
      );
    }

    const deleted = await this.prisma.membershipRole.delete({
      where: { id: membershipRoleId },
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Role removed from user`);
    return deleted;
  }

  // ============================================
  // ADMIN ASSIGNMENT
  // ============================================

  async assignAdminRole(assignerId: string, dto: AssignAdminRoleDto) {
    this.logger.log(`Assigning admin role to user: ${dto.userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if assigner is platform admin
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId: assignerId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform admins can assign admin roles',
      );
    }

    // Validate scope based on admin type
    if (dto.adminType === 'INSTITUTION_ADMIN' && !dto.institutionId) {
      throw new BadRequestException(
        'Institution ID required for INSTITUTION_ADMIN',
      );
    }
    if (dto.adminType === 'FACULTY_ADMIN' && !dto.facultyId) {
      throw new BadRequestException('Faculty ID required for FACULTY_ADMIN');
    }
    if (dto.adminType === 'DEPARTMENT_ADMIN' && !dto.departmentId) {
      throw new BadRequestException(
        'Department ID required for DEPARTMENT_ADMIN',
      );
    }
    if (dto.adminType === 'ORGANIZATION_ADMIN' && !dto.organizationId) {
      throw new BadRequestException(
        'Organization ID required for ORGANIZATION_ADMIN',
      );
    }

    // Check if already an admin
    const existing = await this.prisma.admin.findFirst({
      where: {
        userId: dto.userId,
        adminType: dto.adminType as any,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        organizationId: dto.organizationId,
      },
    });

    if (existing) {
      throw new ConflictException('User already has this admin role');
    }

    const admin = await this.prisma.admin.create({
      data: {
        userId: dto.userId,
        adminType: dto.adminType as any,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        organizationId: dto.organizationId,
        assignedBy: assignerId,
        status: 'ACTIVE',
      },
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Admin role assigned to user: ${dto.userId}`);
    return admin;
  }

  async revokeAdminRole(adminId: string, userId: string) {
    this.logger.log(`Revoking admin role`);

    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin role not found');
    }

    // Check if revoker is platform admin
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform admins can revoke admin roles',
      );
    }

    const revoked = await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'Revoked by admin',
      },
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Admin role revoked`);
    return revoked;
  }

  async getAdmins() {
    const cacheKey = 'admins:all';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const admins = await this.prisma.admin.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        organization: true,
        permissions: true,
      },
      orderBy: { assignedAt: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      admins,
      ['rbac', 'admins'],
      300,
    );

    return admins;
  }

  async getUserPermissions(userId: string) {
    const cacheKey = `user:permissions:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const permissions = await this.prisma.$queryRaw`
      SELECT DISTINCT p.key, p.name, p.description, p.category
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      JOIN membership_roles mr ON mr.role_id = r.id
      JOIN organization_memberships om ON om.id = mr.membership_id
      WHERE om.user_id = ${userId}
      AND om.status = 'ACTIVE'
      UNION
      SELECT DISTINCT p.key, p.name, p.description, p.category
      FROM permissions p
      JOIN admin_permissions ap ON ap.permission_key = p.key
      JOIN admins a ON a.id = ap.admin_id
      WHERE a.user_id = ${userId}
      AND a.status = 'ACTIVE'
    `;

    await this.cacheService.setWithTag(
      cacheKey,
      permissions,
      ['rbac', 'permissions', 'user'],
      120,
    );

    return permissions;
  }

  // ============================================
  // ADDITIONAL HELPER METHODS
  // ============================================

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some((p: any) => p.key === permissionKey);
  }

  /**
   * Check if a user has any of the given permissions
   */
  async hasAnyPermission(
    userId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some((p: any) => permissionKeys.includes(p.key));
  }

  /**
   * Check if a user has all of the given permissions
   */
  async hasAllPermissions(
    userId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    const userPermissionKeys = permissions.map((p: any) => p.key);
    return permissionKeys.every((key) => userPermissionKeys.includes(key));
  }

  /**
   * Get users with a specific permission
   */
  async getUsersWithPermission(permissionKey: string) {
    const users = await this.prisma.$queryRaw`
      SELECT DISTINCT u.id, u.email, u.username
      FROM users u
      JOIN organization_memberships om ON om.user_id = u.id
      JOIN membership_roles mr ON mr.membership_id = om.id
      JOIN roles r ON r.id = mr.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = ${permissionKey}
      AND om.status = 'ACTIVE'
      UNION
      SELECT DISTINCT u.id, u.email, u.username
      FROM users u
      JOIN admins a ON a.user_id = u.id
      JOIN admin_permissions ap ON ap.admin_id = a.id
      WHERE ap.permission_key = ${permissionKey}
      AND a.status = 'ACTIVE'
    `;

    return users;
  }

  /**
   * Get all system roles
   */
  async getSystemRoles() {
    return this.prisma.role.findMany({
      where: { isSystem: true },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  /**
   * Get all roles with their permissions
   */
  async getRolesWithPermissions(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    return this.prisma.role.findMany({
      where,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get user's admin status
   */
  async getUserAdminStatus(userId: string) {
    const admin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        institution: true,
        faculty: true,
        department: true,
        organization: true,
        permissions: true,
      },
    });

    return admin;
  }

  /**
   * Get user's roles across all organizations
   */
  async getUserRoles(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return memberships;
  }

  /**
   * Clone a role with its permissions
   */
  async cloneRole(roleId: string, newName: string, organizationId?: string) {
    this.logger.log(`Cloning role: ${roleId}`);

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const targetOrgId = organizationId || role.organizationId;

    // Check if role already exists in target organization
    const existing = await this.prisma.role.findFirst({
      where: {
        organizationId: targetOrgId,
        name: newName,
      },
    });

    if (existing) {
      throw new ConflictException('Role with this name already exists');
    }

    const newRole = await this.prisma.$transaction(async (tx) => {
      const clonedRole = await tx.role.create({
        data: {
          organizationId: targetOrgId,
          name: newName,
          description: `Cloned from ${role.name}`,
          isSystem: false,
        },
      });

      // Clone permissions
      for (const rp of role.permissions) {
        await tx.rolePermission.create({
          data: {
            roleId: clonedRole.id,
            permissionId: rp.permissionId,
          },
        });
      }

      return clonedRole;
    });

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Role cloned: ${newRole.id}`);
    return newRole;
  }

  /**
   * Bulk assign roles to users
   */
  async bulkAssignRoles(
    assignerId: string,
    assignments: Array<{
      userId: string;
      roleId: string;
      organizationId: string;
    }>,
  ) {
    this.logger.log(`Bulk assigning roles to ${assignments.length} users`);

    const results: any[] = [];

    for (const assignment of assignments) {
      try {
        const result = await this.assignRoleToUser(assignerId, {
          userId: assignment.userId,
          roleId: assignment.roleId,
          organizationId: assignment.organizationId,
        });
        results.push({ success: true, userId: assignment.userId, result });
      } catch (error) {
        results.push({
          success: false,
          userId: assignment.userId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Bulk role assignment completed`);
    return results;
  }
}
