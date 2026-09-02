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

// Define the PermissionCategory enum to match Prisma schema
enum PermissionCategory {
  USER = 'USER',
  INSTITUTION = 'INSTITUTION',
  ORGANIZATION = 'ORGANIZATION',
  FINANCE = 'FINANCE',
  STUDENT = 'STUDENT',
  ACADEMIC = 'ACADEMIC',
  COMMUNICATION = 'COMMUNICATION',
  EVENT = 'EVENT',
  GOVERNANCE = 'GOVERNANCE',
  SYSTEM = 'SYSTEM',
  ANALYTICS = 'ANALYTICS',
}

enum PermissionAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REVIEW = 'REVIEW',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  MANAGE = 'MANAGE',
  ASSIGN = 'ASSIGN',
  REVOKE = 'REVOKE',
}

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
      await this.cacheService.invalidateByTag('rbac');
      await this.cacheService.invalidateByTag('permissions');
      await this.cacheService.invalidateByTag('roles');
      await this.cacheService.invalidateByTag('admins');
      await this.cacheService.invalidateByTag('user');

      await this.cacheService.delete('permissions:all');
      await this.cacheService.delete('admins:all');

      await this.cacheService.invalidatePattern('permission:*');
      await this.cacheService.invalidatePattern('roles:organization:*');
      await this.cacheService.invalidatePattern('role:*');
      await this.cacheService.invalidatePattern('user:permissions:*');
      await this.cacheService.invalidatePattern('admin:permissions:*');

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
  // ADMIN PERMISSIONS (NEW METHODS)
  // ============================================

  async getAdminPermissions(adminId: string) {
    const cacheKey = `admin:permissions:${adminId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      include: {
        permissions: true,
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
        academicSession: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Get all available permissions for reference
    const allPermissions = await this.prisma.permission.findMany();

    const result = {
      ...admin,
      allPermissions,
    };

    await this.cacheService.setWithTag(
      cacheKey,
      result,
      ['rbac', 'admins', 'permissions'],
      300,
    );

    return result;
  }

  async updateAdminPermissions(
    adminId: string,
    permissions: string[],
    action: 'ADD' | 'REMOVE' | 'SET',
    userId: string,
  ) {
    this.logger.log(`Updating admin permissions for: ${adminId}`);

    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Check if the user has permission to update admin permissions
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform admins can update admin permissions',
      );
    }

    // Get existing permissions
    const existingPermissions = await this.prisma.adminPermission.findMany({
      where: { adminId },
    });

    const existingKeys = existingPermissions.map((p) => p.permissionKey);

    let newKeys: string[] = [];

    switch (action) {
      case 'ADD':
        newKeys = [...new Set([...existingKeys, ...permissions])];
        break;
      case 'REMOVE':
        newKeys = existingKeys.filter((key) => !permissions.includes(key));
        break;
      case 'SET':
        newKeys = permissions;
        break;
      default:
        throw new BadRequestException('Invalid action');
    }

    // Delete all existing permissions
    await this.prisma.adminPermission.deleteMany({
      where: { adminId },
    });

    // Create new permissions
    if (newKeys.length > 0) {
      const permissionData = newKeys.map((key) => ({
        adminId,
        permissionKey: key,
        permissionCategory: PermissionCategory.SYSTEM as any,
        permissionAction: PermissionAction.MANAGE as any,
        grantedBy: userId,
        grantedAt: new Date(),
      }));

      await this.prisma.adminPermission.createMany({
        data: permissionData,
      });
    }

    // Invalidate cache
    await this.invalidateRbacCache();

    this.logger.log(`Admin permissions updated for: ${adminId}`);
    return this.getAdminPermissions(adminId);
  }

  async assignAdminWithPermissions(
    assignerId: string,
    userId: string,
    adminType: string,
    scope: {
      institutionId?: string;
      facultyId?: string;
      departmentId?: string;
      organizationId?: string;
      academicSessionId?: string;
    },
    permissions?: string[],
  ) {
    this.logger.log(`Assigning admin with permissions to user: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

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
    if (adminType === 'INSTITUTION_ADMIN' && !scope.institutionId) {
      throw new BadRequestException(
        'Institution ID required for INSTITUTION_ADMIN',
      );
    }
    if (adminType === 'FACULTY_ADMIN' && !scope.facultyId) {
      throw new BadRequestException('Faculty ID required for FACULTY_ADMIN');
    }
    if (adminType === 'DEPARTMENT_ADMIN' && !scope.departmentId) {
      throw new BadRequestException(
        'Department ID required for DEPARTMENT_ADMIN',
      );
    }
    if (adminType === 'ORGANIZATION_ADMIN' && !scope.organizationId) {
      throw new BadRequestException(
        'Organization ID required for ORGANIZATION_ADMIN',
      );
    }

    // Check if admin already exists
    const existing = await this.prisma.admin.findFirst({
      where: {
        userId,
        adminType: adminType as any,
        institutionId: scope.institutionId,
        facultyId: scope.facultyId,
        departmentId: scope.departmentId,
        organizationId: scope.organizationId,
        academicSessionId: scope.academicSessionId || null,
      },
    });

    if (existing) {
      throw new ConflictException('User already has this admin role');
    }

    // Create admin
    const admin = await this.prisma.admin.create({
      data: {
        userId,
        adminType: adminType as any,
        institutionId: scope.institutionId,
        facultyId: scope.facultyId,
        departmentId: scope.departmentId,
        organizationId: scope.organizationId,
        academicSessionId: scope.academicSessionId,
        assignedBy: assignerId,
        status: 'ACTIVE',
      },
    });

    // Assign permissions if provided
    if (permissions && permissions.length > 0) {
      const permissionData = permissions.map((key) => ({
        adminId: admin.id,
        permissionKey: key,
        permissionCategory: PermissionCategory.SYSTEM as any,
        permissionAction: PermissionAction.MANAGE as any,
        grantedBy: assignerId,
        grantedAt: new Date(),
      }));

      await this.prisma.adminPermission.createMany({
        data: permissionData,
      });
    } else {
      // Assign default permissions based on admin type
      await this.assignDefaultPermissions(admin.id, adminType);
    }

    await this.invalidateRbacCache();

    this.logger.log(`Admin assigned with permissions to user: ${userId}`);
    return admin;
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

      if (dto.permissions && dto.permissions.length > 0) {
        const permissions = await tx.permission.findMany({
          where: { key: { in: dto.permissions } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: newRole.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return newRole;
    });

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

      if (dto.permissions) {
        await tx.rolePermission.deleteMany({
          where: { roleId },
        });

        const permissions = await tx.permission.findMany({
          where: { key: { in: dto.permissions } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return updatedRole;
    });

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
    if (
      (dto.adminType === 'ORGANIZATION_ADMIN' ||
        dto.adminType === 'CLUB_ADMIN') &&
      !dto.organizationId
    ) {
      throw new BadRequestException(
        'Organization ID required for organization admin roles',
      );
    }
    if (
      (dto.adminType === 'ORGANIZATION_ADMIN' ||
        dto.adminType === 'CLUB_ADMIN') &&
      !dto.academicSessionId
    ) {
      throw new BadRequestException(
        'Academic session ID is required for organization admin roles',
      );
    }

    if (dto.academicSessionId) {
      const session = await this.prisma.academicSession.findUnique({
        where: { id: dto.academicSessionId },
      });
      if (!session) {
        throw new NotFoundException('Academic session not found');
      }

      if (
        (dto.adminType === 'ORGANIZATION_ADMIN' ||
          dto.adminType === 'CLUB_ADMIN') &&
        (!session.isCurrent || session.scope !== 'INSTITUTION')
      ) {
        throw new BadRequestException(
          'Organization admins must be assigned to the institution current academic session',
        );
      }

      if (dto.organizationId) {
        const org = await this.prisma.organization.findUnique({
          where: { id: dto.organizationId },
          include: { institution: true },
        });
        if (org && session.institutionId !== org.institutionId) {
          throw new BadRequestException(
            'Academic session must belong to the same institution as the organization',
          );
        }
        if (
          (dto.adminType === 'ORGANIZATION_ADMIN' ||
            dto.adminType === 'CLUB_ADMIN') &&
          org?.academicSessionId !== session.id
        ) {
          throw new BadRequestException(
            'The organization and admin assignment must belong to the same academic session',
          );
        }
      }
    }

    const existing = await this.prisma.admin.findFirst({
      where: {
        userId: dto.userId,
        adminType: dto.adminType as any,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        organizationId: dto.organizationId,
        academicSessionId: dto.academicSessionId || null,
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
        academicSessionId: dto.academicSessionId,
        assignedBy: assignerId,
        status: 'ACTIVE',
      },
    });

    // Assign default permissions
    await this.assignDefaultPermissions(admin.id, dto.adminType);

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
        academicSession: true,
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

  async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some((p: any) => p.key === permissionKey);
  }

  async hasAnyPermission(
    userId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some((p: any) => permissionKeys.includes(p.key));
  }

  async hasAllPermissions(
    userId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    const userPermissionKeys = permissions.map((p: any) => p.key);
    return permissionKeys.every((key) => userPermissionKeys.includes(key));
  }

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
        academicSession: true,
        permissions: true,
      },
    });

    return admin;
  }

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

      await tx.rolePermission.createMany({
        data: role.permissions.map((rp) => ({
          roleId: clonedRole.id,
          permissionId: rp.permissionId,
        })),
        skipDuplicates: true,
      });

      return clonedRole;
    });

    await this.invalidateRbacCache();

    this.logger.log(`Role cloned: ${newRole.id}`);
    return newRole;
  }

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

    await this.invalidateRbacCache();

    this.logger.log(`Bulk role assignment completed`);
    return results;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async assignDefaultPermissions(
    adminId: string,
    adminType: string,
  ): Promise<void> {
    let defaultPermissions: string[] = [];

    switch (adminType) {
      case 'PLATFORM_ADMIN':
        defaultPermissions = [
          'users:create',
          'users:read',
          'users:update',
          'users:delete',
          'users:manage',
          'institution:create',
          'institution:read',
          'institution:update',
          'institution:delete',
          'institution:manage',
          'organization:create',
          'organization:read',
          'organization:update',
          'organization:delete',
          'organization:manage',
          'finance:read',
          'finance:create',
          'finance:update',
          'finance:delete',
          'finance:approve',
          'finance:export',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
          'finance:due:delete',
          'student:create',
          'student:read',
          'student:update',
          'student:delete',
          'student:verify',
          'student:promote',
          'academic:read',
          'academic:create',
          'academic:update',
          'academic:delete',
          'communication:create',
          'communication:read',
          'communication:update',
          'communication:delete',
          'admin:assign',
          'admin:revoke',
          'admin:view',
          'admin:manage',
          'analytics:read',
          'analytics:export',
          'system:read',
          'system:update',
          'system:manage',
          'system:maintenance',
          'system:feature_flag',
        ];
        break;
      case 'INSTITUTION_ADMIN':
        defaultPermissions = [
          'users:read',
          'institution:read',
          'institution:update',
          'organization:read',
          'organization:create',
          'organization:update',
          'finance:read',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
          'student:read',
          'student:update',
          'academic:read',
          'communication:create',
        ];
        break;
      case 'FACULTY_ADMIN':
        defaultPermissions = [
          'users:read',
          'student:read',
          'student:update',
          'academic:read',
          'organization:read',
          'communication:create',
          'finance:read',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
        ];
        break;
      case 'DEPARTMENT_ADMIN':
        defaultPermissions = [
          'users:read',
          'student:read',
          'academic:read',
          'communication:create',
          'finance:read',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
        ];
        break;
      case 'ORGANIZATION_ADMIN':
        defaultPermissions = [
          'users:read',
          'organization:read',
          'organization:update',
          'organization:manage',
          'finance:read',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
          'finance:due:delete',
          'communication:create',
          'student:read',
        ];
        break;
      case 'CLUB_ADMIN':
        defaultPermissions = [
          'users:read',
          'organization:read',
          'organization:update',
          'communication:create',
          'finance:read',
          'finance:due:create',
          'finance:due:assign',
          'finance:due:view',
        ];
        break;
      default:
        defaultPermissions = ['users:read'];
    }

    // Create permission records with proper enum types
    const permissionData = defaultPermissions.map((permissionKey) => ({
      adminId,
      permissionKey,
      permissionCategory: PermissionCategory.SYSTEM as any,
      permissionAction: PermissionAction.MANAGE as any,
      grantedBy: 'system',
      grantedAt: new Date(),
    }));

    await this.prisma.adminPermission.createMany({
      data: permissionData,
    });
  }
}
