import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  // Predefined permission keys
  static readonly PERMISSIONS = {
    // User permissions
    USER_CREATE: 'users:create',
    USER_READ: 'users:read',
    USER_UPDATE: 'users:update',
    USER_DELETE: 'users:delete',
    USER_MANAGE: 'users:manage',

    // Institution permissions
    INSTITUTION_CREATE: 'institution:create',
    INSTITUTION_READ: 'institution:read',
    INSTITUTION_UPDATE: 'institution:update',
    INSTITUTION_DELETE: 'institution:delete',
    INSTITUTION_MANAGE: 'institution:manage',

    // Faculty permissions
    FACULTY_CREATE: 'faculty:create',
    FACULTY_READ: 'faculty:read',
    FACULTY_UPDATE: 'faculty:update',
    FACULTY_DELETE: 'faculty:delete',
    FACULTY_MANAGE: 'faculty:manage',

    // Department permissions
    DEPARTMENT_CREATE: 'department:create',
    DEPARTMENT_READ: 'department:read',
    DEPARTMENT_UPDATE: 'department:update',
    DEPARTMENT_DELETE: 'department:delete',
    DEPARTMENT_MANAGE: 'department:manage',

    // Academic Level permissions
    ACADEMIC_LEVEL_CREATE: 'academic_level:create',
    ACADEMIC_LEVEL_READ: 'academic_level:read',
    ACADEMIC_LEVEL_UPDATE: 'academic_level:update',
    ACADEMIC_LEVEL_DELETE: 'academic_level:delete',

    // Academic Session permissions
    ACADEMIC_SESSION_CREATE: 'academic_session:create',
    ACADEMIC_SESSION_READ: 'academic_session:read',
    ACADEMIC_SESSION_UPDATE: 'academic_session:update',
    ACADEMIC_SESSION_DELETE: 'academic_session:delete',

    // Organization permissions
    ORGANIZATION_CREATE: 'organization:create',
    ORGANIZATION_READ: 'organization:read',
    ORGANIZATION_UPDATE: 'organization:update',
    ORGANIZATION_DELETE: 'organization:delete',
    ORGANIZATION_MANAGE: 'organization:manage',
    ORGANIZATION_APPROVE: 'organization:approve',

    // Finance permissions
    FINANCE_READ: 'finance:read',
    FINANCE_CREATE: 'finance:create',
    FINANCE_UPDATE: 'finance:update',
    FINANCE_DELETE: 'finance:delete',
    FINANCE_APPROVE: 'finance:approve',
    FINANCE_REVIEW: 'finance:review',
    FINANCE_EXPORT: 'finance:export',

    // Student permissions
    STUDENT_CREATE: 'student:create',
    STUDENT_READ: 'student:read',
    STUDENT_UPDATE: 'student:update',
    STUDENT_DELETE: 'student:delete',
    STUDENT_VERIFY: 'student:verify',
    STUDENT_PROMOTE: 'student:promote',

    // Academic permissions
    ACADEMIC_READ: 'academic:read',
    ACADEMIC_CREATE: 'academic:create',
    ACADEMIC_UPDATE: 'academic:update',
    ACADEMIC_DELETE: 'academic:delete',
    ACADEMIC_MANAGE: 'academic:manage',

    // Communication permissions
    COMMUNICATION_CREATE: 'communication:create',
    COMMUNICATION_READ: 'communication:read',
    COMMUNICATION_UPDATE: 'communication:update',
    COMMUNICATION_DELETE: 'communication:delete',
    COMMUNICATION_MANAGE: 'communication:manage',

    // Event permissions
    EVENT_CREATE: 'event:create',
    EVENT_READ: 'event:read',
    EVENT_UPDATE: 'event:update',
    EVENT_DELETE: 'event:delete',
    EVENT_MANAGE: 'event:manage',
    EVENT_APPROVE: 'event:approve',

    // Governance permissions
    GOVERNANCE_CREATE: 'governance:create',
    GOVERNANCE_READ: 'governance:read',
    GOVERNANCE_UPDATE: 'governance:update',
    GOVERNANCE_DELETE: 'governance:delete',
    GOVERNANCE_MANAGE: 'governance:manage',
    GOVERNANCE_ELECTION: 'governance:election',

    // System permissions
    SYSTEM_READ: 'system:read',
    SYSTEM_UPDATE: 'system:update',
    SYSTEM_MANAGE: 'system:manage',
    SYSTEM_MAINTENANCE: 'system:maintenance',
    SYSTEM_FEATURE_FLAG: 'system:feature_flag',

    // Analytics permissions
    ANALYTICS_READ: 'analytics:read',
    ANALYTICS_EXPORT: 'analytics:export',
    ANALYTICS_MANAGE: 'analytics:manage',

    // Admin permissions
    ADMIN_ASSIGN: 'admin:assign',
    ADMIN_REVOKE: 'admin:revoke',
    ADMIN_VIEW: 'admin:view',
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has a specific permission
   */
  async checkPermission(
    userId: string,
    permissionKey: string,
    resourceId?: string,
  ): Promise<boolean> {
    try {
      const admin = await (this.prisma as any).admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admin) {
        return false;
      }

      // Platform admins have all permissions
      if (admin.adminType === 'PLATFORM_ADMIN') {
        return true;
      }

      // Check if admin has the specific permission
      const hasPermission = admin.permissions.some((perm: any) => {
        if (perm.permissionKey === permissionKey) {
          if (resourceId) {
            return perm.resourceId === resourceId || perm.resourceId === null;
          }
          return true;
        }
        return false;
      });

      return hasPermission;
    } catch (error) {
      this.logger.error(`Permission check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(
    userId: string,
    permissions: string[],
  ): Promise<{ [key: string]: boolean }> {
    const result: { [key: string]: boolean } = {};

    for (const permission of permissions) {
      result[permission] = await this.checkPermission(userId, permission);
    }

    return result;
  }

  /**
   * Check if user has any of the given permissions
   */
  async hasAnyPermission(
    userId: string,
    permissions: string[],
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.checkPermission(userId, permission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const admin = await (this.prisma as any).admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admin) {
        return [];
      }

      // Platform admins get all permissions
      if (admin.adminType === 'PLATFORM_ADMIN') {
        return Object.values(PermissionService.PERMISSIONS);
      }

      return admin.permissions.map((perm: any) => perm.permissionKey);
    } catch (error) {
      this.logger.error(`Failed to get user permissions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user's admin scope
   */
  async getUserAdminScope(userId: string): Promise<{
    adminType?: string;
    institutionId?: string;
    facultyId?: string;
    departmentId?: string;
    organizationId?: string;
  } | null> {
    try {
      const admin = await (this.prisma as any).admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      if (!admin) {
        return null;
      }

      return {
        adminType: admin.adminType,
        institutionId: admin.institutionId || undefined,
        facultyId: admin.facultyId || undefined,
        departmentId: admin.departmentId || undefined,
        organizationId: admin.organizationId || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to get admin scope: ${error.message}`);
      return null;
    }
  }

  /**
   * Assign admin role to a user
   */
  async assignAdminRole(
    assignerId: string,
    userId: string,
    adminType: string,
    scope?: {
      institutionId?: string;
      facultyId?: string;
      departmentId?: string;
      organizationId?: string;
    },
  ): Promise<any> {
    // Validate scope based on admin type
    if (adminType === 'INSTITUTION_ADMIN' && !scope?.institutionId) {
      throw new Error('Institution ID required for INSTITUTION_ADMIN');
    }
    if (adminType === 'FACULTY_ADMIN' && !scope?.facultyId) {
      throw new Error('Faculty ID required for FACULTY_ADMIN');
    }
    if (adminType === 'DEPARTMENT_ADMIN' && !scope?.departmentId) {
      throw new Error('Department ID required for DEPARTMENT_ADMIN');
    }
    if (adminType === 'ORGANIZATION_ADMIN' && !scope?.organizationId) {
      throw new Error('Organization ID required for ORGANIZATION_ADMIN');
    }

    // Check if assigner has permission to assign this role
    const canAssign = await this.checkPermission(assignerId, 'admin:assign');

    if (!canAssign) {
      throw new ForbiddenException(
        'You do not have permission to assign this admin role',
      );
    }

    // Create admin record
    const admin = await (this.prisma as any).admin.create({
      data: {
        userId,
        adminType,
        institutionId: scope?.institutionId,
        facultyId: scope?.facultyId,
        departmentId: scope?.departmentId,
        organizationId: scope?.organizationId,
        assignedBy: assignerId,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    // Assign default permissions based on admin type
    await this.assignDefaultPermissions(admin.id, adminType);

    this.logger.log(
      `Admin role ${adminType} assigned to user ${userId} by ${assignerId}`,
    );

    return admin;
  }

  /**
   * Assign default permissions based on admin type
   */
  private async assignDefaultPermissions(
    adminId: string,
    adminType: string,
  ): Promise<void> {
    let defaultPermissions: string[] = [];

    switch (adminType) {
      case 'PLATFORM_ADMIN':
        defaultPermissions = Object.values(PermissionService.PERMISSIONS);
        break;
      case 'INSTITUTION_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.INSTITUTION_READ,
          PermissionService.PERMISSIONS.INSTITUTION_UPDATE,
          PermissionService.PERMISSIONS.ORGANIZATION_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_CREATE,
          PermissionService.PERMISSIONS.ORGANIZATION_UPDATE,
          PermissionService.PERMISSIONS.FINANCE_READ,
          PermissionService.PERMISSIONS.STUDENT_READ,
          PermissionService.PERMISSIONS.STUDENT_UPDATE,
          PermissionService.PERMISSIONS.ACADEMIC_READ,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
          PermissionService.PERMISSIONS.EVENT_READ,
        ];
        break;
      case 'FACULTY_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.STUDENT_READ,
          PermissionService.PERMISSIONS.STUDENT_UPDATE,
          PermissionService.PERMISSIONS.ACADEMIC_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_READ,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
        ];
        break;
      case 'DEPARTMENT_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.STUDENT_READ,
          PermissionService.PERMISSIONS.ACADEMIC_READ,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
        ];
        break;
      case 'ORGANIZATION_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_UPDATE,
          PermissionService.PERMISSIONS.ORGANIZATION_MANAGE,
          PermissionService.PERMISSIONS.FINANCE_READ,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
          PermissionService.PERMISSIONS.EVENT_CREATE,
          PermissionService.PERMISSIONS.GOVERNANCE_READ,
        ];
        break;
      case 'CLUB_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_UPDATE,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
          PermissionService.PERMISSIONS.EVENT_CREATE,
        ];
        break;
      default:
        defaultPermissions = [PermissionService.PERMISSIONS.USER_READ];
    }

    // Create permission records - add required fields
    const permissionData = defaultPermissions.map((permissionKey) => ({
      adminId,
      permissionKey,
      grantedBy: 'system',
      permissionCategory: 'SYSTEM', // Add required field
      permissionAction: 'MANAGE', // Add required field
    }));

    await (this.prisma as any).adminPermission.createMany({
      data: permissionData,
    });
  }

  /**
   * Revoke admin role
   */
  async revokeAdminRole(
    revokerId: string,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    const admin = await (this.prisma as any).admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    // Check if revoker has permission
    const canRevoke = await this.checkPermission(revokerId, 'admin:revoke');

    if (!canRevoke) {
      throw new ForbiddenException(
        'You do not have permission to revoke this admin role',
      );
    }

    await (this.prisma as any).admin.update({
      where: { id: adminId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    this.logger.log(
      `Admin role ${admin.adminType} revoked for user ${admin.userId} by ${revokerId}`,
    );
  }

  /**
   * Get all admins
   */
  async getAllAdmins() {
    return (this.prisma as any).admin.findMany({
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
    });
  }

  /**
   * Get admin by ID
   */
  async getAdminById(adminId: string) {
    return (this.prisma as any).admin.findUnique({
      where: { id: adminId },
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
    });
  }
}
