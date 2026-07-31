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

    await this.cacheService.set(cacheKey, permissions, 600);
    return permissions;
  }

  async getPermissionByKey(key: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { key },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

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

    await this.cacheService.delete(`roles:organization:${dto.organizationId}`);

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

    await this.cacheService.set(cacheKey, roles, 300);
    return roles;
  }

  async getRoleById(roleId: string) {
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

    await this.cacheService.delete(`roles:organization:${role.organizationId}`);

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

    await this.cacheService.delete(`roles:organization:${role.organizationId}`);

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

    this.logger.log(`Admin role revoked`);
    return revoked;
  }

  async getAdmins() {
    return this.prisma.admin.findMany({
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
  }

  async getUserPermissions(userId: string) {
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

    return permissions;
  }
}
