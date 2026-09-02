// src/v1/auth/permission.service.ts

import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    FINANCE_WITHDRAWAL_CREATE: 'finance:withdrawal:create',
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
   * Check if a user has a specific permission for a specific resource
   * THIS IS THE CRITICAL FIX - Ensures permissions are scoped correctly
   */
  async checkPermission(
    userId: string,
    permissionKey: string,
    resourceId?: string,
  ): Promise<boolean> {
    try {
      // Get all active admins for this user
      const admins = await this.prisma.admin.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admins.length) {
        return false;
      }

      // Platform admins have all permissions
      if (admins.some((admin) => admin.adminType === 'PLATFORM_ADMIN')) {
        return true;
      }

      // Check each admin's permissions
      for (const admin of admins) {
        // Check if this admin has the required permission
        const hasPermission = admin.permissions.some((perm) => {
          if (perm.permissionKey !== permissionKey) {
            return false;
          }

          // If resourceId is provided, check if the permission applies to this resource
          if (resourceId) {
            // Check if the permission has no resource restriction or matches the resource
            return perm.resourceId === null || perm.resourceId === resourceId;
          }

          return true;
        });

        if (hasPermission) {
          // Also verify the admin's scope includes the resource
          if (resourceId) {
            const isInScope = await this.isResourceInAdminScope(
              admin,
              resourceId,
            );
            if (!isInScope) {
              continue; // Try next admin
            }
          }
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Permission check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a resource is within an admin's scope
   */
  private async isResourceInAdminScope(
    admin: any,
    resourceId: string,
  ): Promise<boolean> {
    // Platform admins have access to everything
    if (admin.adminType === 'PLATFORM_ADMIN') {
      return true;
    }

    // Check based on admin type
    switch (admin.adminType) {
      case 'INSTITUTION_ADMIN':
        return await this.isResourceInInstitution(
          admin.institutionId,
          resourceId,
        );

      case 'FACULTY_ADMIN':
        return await this.isResourceInFaculty(admin.facultyId, resourceId);

      case 'DEPARTMENT_ADMIN':
        return await this.isResourceInDepartment(
          admin.departmentId,
          resourceId,
        );

      case 'ORGANIZATION_ADMIN':
      case 'CLUB_ADMIN':
        return await this.isResourceInOrganizationSession(admin, resourceId);

      default:
        return false;
    }
  }

  private async isResourceInInstitution(
    institutionId: string,
    resourceId: string,
  ): Promise<boolean> {
    if (institutionId === resourceId) return true;

    // Check if resource is a faculty in this institution
    const faculty = await this.prisma.faculty.findFirst({
      where: { id: resourceId, institutionId },
    });
    if (faculty) return true;

    // Check if resource is a department in this institution
    const department = await this.prisma.department.findFirst({
      where: { id: resourceId, faculty: { institutionId } },
    });
    if (department) return true;

    // Check if resource is an organization in this institution
    const organization = await this.prisma.organization.findFirst({
      where: { id: resourceId, institutionId },
    });
    if (organization) return true;

    // Check if resource is a student in this institution
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: resourceId, institutionId },
    });
    if (student) return true;

    return false;
  }

  private async isResourceInFaculty(
    facultyId: string,
    resourceId: string,
  ): Promise<boolean> {
    if (facultyId === resourceId) return true;

    // Check if resource is a department in this faculty
    const department = await this.prisma.department.findFirst({
      where: { id: resourceId, facultyId },
    });
    if (department) return true;

    // Check if resource is an organization in this faculty
    const organization = await this.prisma.organization.findFirst({
      where: { id: resourceId, facultyId },
    });
    if (organization) return true;

    // Check if resource is a student in this faculty
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: resourceId, facultyId },
    });
    if (student) return true;

    return false;
  }

  private async isResourceInDepartment(
    departmentId: string,
    resourceId: string,
  ): Promise<boolean> {
    if (departmentId === resourceId) return true;

    // Check if resource is an organization in this department
    const organization = await this.prisma.organization.findFirst({
      where: { id: resourceId, departmentId },
    });
    if (organization) return true;

    // Check if resource is a student in this department
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: resourceId, departmentId },
    });
    if (student) return true;

    return false;
  }

  private async isResourceInOrganizationSession(
    admin: any,
    resourceId: string,
  ): Promise<boolean> {
    const organizationId = admin.organizationId;
    const academicSessionId = admin.academicSessionId;
    if (!organizationId || !academicSessionId) return false;

    if (organizationId === resourceId) {
      const organization = await this.prisma.organization.findFirst({
        where: { id: resourceId, academicSessionId },
      });
      return !!organization;
    }

    // Check if resource is a membership in this organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        id: resourceId,
        organizationId,
        joinedSessionId: academicSessionId,
      },
    });
    if (membership) return true;

    // Check if resource is a due in this organization
    const due = await this.prisma.due.findFirst({
      where: { id: resourceId, organizationId, sessionId: academicSessionId },
    });
    if (due) return true;

    // Check if resource is an event in this organization
    const event = await this.prisma.event.findFirst({
      where: {
        id: resourceId,
        organizationId,
        organization: { academicSessionId },
      },
    });
    if (event) return true;

    // Check if resource is an announcement in this organization
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id: resourceId,
        organizationId,
        organization: { academicSessionId },
      },
    });
    if (announcement) return true;

    return false;
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(
    userId: string,
    permissions: string[],
  ): Promise<{ [key: string]: boolean }> {
    const granted = new Set(await this.getUserPermissions(userId));
    return Object.fromEntries(
      permissions.map((permission) => [permission, granted.has(permission)]),
    );
  }

  /**
   * Check if user has any of the given permissions
   */
  async hasAnyPermission(
    userId: string,
    permissions: string[],
  ): Promise<boolean> {
    const granted = new Set(await this.getUserPermissions(userId));
    return permissions.some((permission) => granted.has(permission));
  }

  /**
   * Get all permissions for a user with scope context
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const admins = await this.prisma.admin.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admins.length) {
        return [];
      }

      // Platform admins get all permissions
      if (admins.some((admin) => admin.adminType === 'PLATFORM_ADMIN')) {
        return Object.values(PermissionService.PERMISSIONS);
      }

      const permissions = admins.flatMap((admin) => admin.permissions || []);
      return Array.from(
        new Set(permissions.map((perm: any) => String(perm.permissionKey))),
      );
    } catch (error) {
      this.logger.error(`Failed to get user permissions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user admin scopes - THIS IS CRITICAL for proper scope isolation
   */
  async getUserAdminScopes(userId: string): Promise<
    Array<{
      id: string;
      adminType?: string;
      institutionId?: string;
      facultyId?: string;
      departmentId?: string;
      organizationId?: string;
      academicSessionId?: string;
      status?: string;
    }>
  > {
    try {
      const admins = await this.prisma.admin.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: {
          institution: true,
          faculty: {
            include: {
              institution: true,
            },
          },
          department: {
            include: {
              faculty: {
                include: {
                  institution: true,
                },
              },
            },
          },
          organization: true,
          academicSession: true,
        },
      });

      return admins.map((admin: any) => ({
        id: admin.id,
        adminType: admin.adminType,
        institutionId: admin.institutionId || undefined,
        facultyId: admin.facultyId || undefined,
        departmentId: admin.departmentId || undefined,
        organizationId: admin.organizationId || undefined,
        academicSessionId: admin.academicSessionId || undefined,
        status: admin.status,
      }));
    } catch (error) {
      this.logger.error(`Failed to get user admin scopes: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user's primary admin scope
   */
  async getUserAdminScope(userId: string): Promise<{
    id?: string;
    adminType?: string;
    institutionId?: string;
    facultyId?: string;
    departmentId?: string;
    organizationId?: string;
  } | null> {
    try {
      const admin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      if (!admin) {
        return null;
      }

      return {
        id: admin.id,
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
   * Assign admin role to a user with proper scoping
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

    // Create admin record with proper scope - convert adminType to proper enum
    const admin = await this.prisma.admin.create({
      data: {
        userId,
        adminType: adminType as any, // Cast to any to handle enum
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
      `Admin role ${adminType} assigned to user ${userId} by ${assignerId} with scope: ${JSON.stringify(scope)}`,
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
          PermissionService.PERMISSIONS.FINANCE_WITHDRAWAL_CREATE,
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
          PermissionService.PERMISSIONS.FINANCE_READ,
          PermissionService.PERMISSIONS.FINANCE_WITHDRAWAL_CREATE,
        ];
        break;
      case 'DEPARTMENT_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.STUDENT_READ,
          PermissionService.PERMISSIONS.ACADEMIC_READ,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
          PermissionService.PERMISSIONS.FINANCE_WITHDRAWAL_CREATE,
        ];
        break;
      case 'ORGANIZATION_ADMIN':
        defaultPermissions = [
          PermissionService.PERMISSIONS.USER_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_READ,
          PermissionService.PERMISSIONS.ORGANIZATION_UPDATE,
          PermissionService.PERMISSIONS.ORGANIZATION_MANAGE,
          PermissionService.PERMISSIONS.FINANCE_READ,
          PermissionService.PERMISSIONS.FINANCE_WITHDRAWAL_CREATE,
          PermissionService.PERMISSIONS.COMMUNICATION_CREATE,
          PermissionService.PERMISSIONS.FINANCE_WITHDRAWAL_CREATE,
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

    // Create permission records with proper enum types
    const permissionData = defaultPermissions.map((permissionKey) => ({
      adminId,
      permissionKey,
      grantedBy: 'system',
      permissionCategory: 'SYSTEM' as any, // Cast to any to handle enum
      permissionAction: 'MANAGE' as any, // Cast to any to handle enum
    }));

    await this.prisma.adminPermission.createMany({
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
    const admin = await this.prisma.admin.findUnique({
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

    await this.prisma.admin.update({
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
    });
  }

  /**
   * Get admin by ID
   */
  async getAdminById(adminId: string) {
    return this.prisma.admin.findUnique({
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
