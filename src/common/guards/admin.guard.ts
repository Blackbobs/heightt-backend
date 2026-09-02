// src/common/guards/admin.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../../v1/auth/permission.service';

// Custom decorator for permission requirements
export const RequirePermission = (
  permission: string,
  resourceIdParam?: string,
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('permission', permission, descriptor.value);
    Reflect.defineMetadata(
      'resourceIdParam',
      resourceIdParam,
      descriptor.value,
    );
    return descriptor;
  };
};

// Custom decorator for admin type requirements
export const RequireAdminType = (...types: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('adminTypes', types, descriptor.value);
    return descriptor;
  };
};

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('No user found in request');
      throw new UnauthorizedException('Authentication required');
    }

    try {
      // Get all active admin records for this user
      const admins = await this.prisma.admin.findMany({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admins.length) {
        this.logger.warn(
          `User ${user.id} attempted to access admin endpoint without admin privileges`,
        );
        throw new ForbiddenException('Admin access required');
      }

      // CRITICAL: Determine which admin scope applies to this request
      // Check for organization ID from various sources
      const organizationId =
        request.params?.organizationId ||
        request.query?.organizationId ||
        request.body?.organizationId;
      const academicSessionId =
        request.params?.academicSessionId ||
        request.query?.academicSessionId ||
        request.body?.academicSessionId ||
        request.params?.sessionId ||
        request.query?.sessionId ||
        request.body?.sessionId;

      // Check for other resource IDs
      const facultyId = request.params?.facultyId || request.query?.facultyId;
      const departmentId =
        request.params?.departmentId || request.query?.departmentId;
      const institutionId =
        request.params?.institutionId || request.query?.institutionId;

      let organizationScopePromise: Promise<{
        academicSessionId: string | null;
        institutionId: string;
        facultyId: string | null;
        departmentId: string | null;
      } | null> | null = null;
      const getOrganizationScope = () => {
        if (!organizationScopePromise) {
          organizationScopePromise = Promise.resolve(
            this.prisma.organization.findUnique({
              where: { id: organizationId },
              select: {
                academicSessionId: true,
                institutionId: true,
                facultyId: true,
                departmentId: true,
              },
            }),
          );
        }
        return organizationScopePromise;
      };

      // Find the admin that matches the scope of the request
      let matchingAdmin: any = null;

      // If organizationId is provided, find admin for that organization
      if (organizationId) {
        const organizationAdmins = admins.filter(
          (admin) => admin.organizationId === organizationId,
        );
        let found = academicSessionId
          ? organizationAdmins.find(
              (admin) => admin.academicSessionId === academicSessionId,
            )
          : undefined;
        if (!found && !academicSessionId && organizationAdmins.length) {
          const organization = await getOrganizationScope();
          found = organizationAdmins.find(
            (admin) =>
              admin.academicSessionId === organization?.academicSessionId,
          );
        }
        if (found) matchingAdmin = found;
      }

      // If no match and facultyId is provided
      if (!matchingAdmin && facultyId) {
        const found = admins.find((admin) => admin.facultyId === facultyId);
        if (found) matchingAdmin = found;
      }

      // If no match and departmentId is provided
      if (!matchingAdmin && departmentId) {
        const found = admins.find(
          (admin) => admin.departmentId === departmentId,
        );
        if (found) matchingAdmin = found;
      }

      // If no match and institutionId is provided
      if (!matchingAdmin && institutionId) {
        const found = admins.find(
          (admin) => admin.institutionId === institutionId,
        );
        if (found) matchingAdmin = found;
      }

      // If still no match, check if any admin has a broader scope that includes the resource
      if (!matchingAdmin && organizationId) {
        const organization = await getOrganizationScope();
        // Check if any admin's scope includes this organization
        for (const admin of admins) {
          if (admin.adminType === 'PLATFORM_ADMIN') {
            matchingAdmin = admin;
            break;
          }

          // Check if this organization belongs to the admin's institution
          if (admin.institutionId) {
            if (
              organization &&
              organization.institutionId === admin.institutionId
            ) {
              matchingAdmin = admin;
              break;
            }
          }

          // Check if this organization belongs to the admin's faculty
          if (admin.facultyId) {
            if (organization && organization.facultyId === admin.facultyId) {
              matchingAdmin = admin;
              break;
            }
          }

          // Check if this organization belongs to the admin's department
          if (admin.departmentId) {
            if (
              organization &&
              organization.departmentId === admin.departmentId
            ) {
              matchingAdmin = admin;
              break;
            }
          }
        }
      }

      if (!matchingAdmin) {
        matchingAdmin = admins.find(
          (admin) => admin.adminType === 'PLATFORM_ADMIN',
        );
      }

      if (
        !matchingAdmin &&
        (organizationId || facultyId || departmentId || institutionId)
      ) {
        throw new ForbiddenException(
          'This admin assignment does not include the requested scope or academic session',
        );
      }

      // Requests without a scoped resource can use the first assignment; the
      // permission check below still validates its explicit permissions.
      if (!matchingAdmin) {
        matchingAdmin = admins[0];
      }

      // Check for admin type requirements
      const requiredAdminTypes = this.reflector.get<string[]>(
        'adminTypes',
        context.getHandler(),
      );

      if (requiredAdminTypes && requiredAdminTypes.length > 0) {
        const hasRequiredType = admins.some((admin) =>
          requiredAdminTypes.includes(admin.adminType),
        );

        if (!hasRequiredType) {
          this.logger.warn(
            `User ${user.id} does not have required admin type: ${requiredAdminTypes.join(', ')}`,
          );
          throw new ForbiddenException('Insufficient admin privileges');
        }
      }

      // Check for permission requirements
      const requiredPermission = this.reflector.get<string>(
        'permission',
        context.getHandler(),
      );

      if (requiredPermission) {
        const resourceIdParam = this.reflector.get<string>(
          'resourceIdParam',
          context.getHandler(),
        );

        let resourceId: string | undefined;
        if (resourceIdParam) {
          resourceId = request.params[resourceIdParam];
        }

        // Use the matching admin to check permission with proper scope
        const eligibleAdmins = academicSessionId
          ? admins.filter(
              (admin) =>
                admin.adminType === 'PLATFORM_ADMIN' ||
                !['ORGANIZATION_ADMIN', 'CLUB_ADMIN'].includes(
                  admin.adminType,
                ) ||
                admin.academicSessionId === academicSessionId,
            )
          : admins;
        let hasPermission = false;
        for (const admin of resourceId ? eligibleAdmins : [matchingAdmin]) {
          if (
            await this.checkPermissionForAdmin(
              admin,
              requiredPermission,
              resourceId,
            )
          ) {
            hasPermission = true;
            matchingAdmin = admin;
            break;
          }
        }

        if (!hasPermission) {
          this.logger.warn(
            `User ${user.id} does not have permission: ${requiredPermission} for resource: ${resourceId || 'any'}`,
          );
          throw new ForbiddenException(
            `Missing required permission: ${requiredPermission}`,
          );
        }
      }

      // Attach admin info to request for use in controllers
      request.admin = {
        id: matchingAdmin.id,
        type: matchingAdmin.adminType,
        institutionId: matchingAdmin.institutionId,
        facultyId: matchingAdmin.facultyId,
        departmentId: matchingAdmin.departmentId,
        organizationId: matchingAdmin.organizationId,
        academicSessionId: matchingAdmin.academicSessionId,
        // Include all admins for multi-scope support
        allAdmins: admins.map((a) => ({
          id: a.id,
          type: a.adminType,
          institutionId: a.institutionId,
          facultyId: a.facultyId,
          departmentId: a.departmentId,
          organizationId: a.organizationId,
          academicSessionId: a.academicSessionId,
        })),
      };

      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      this.logger.error(`Admin guard error: ${error.message}`);
      throw new ForbiddenException('Admin access required');
    }
  }

  /**
   * Check permission for a specific admin with proper scope
   */
  private async checkPermissionForAdmin(
    admin: any,
    permissionKey: string,
    resourceId?: string,
  ): Promise<boolean> {
    // Platform admins have all permissions
    if (admin.adminType === 'PLATFORM_ADMIN') {
      return true;
    }

    // Check if the admin has this permission
    const hasPermission = admin.permissions?.some((perm: any) => {
      if (perm.permissionKey !== permissionKey) {
        return false;
      }

      if (resourceId) {
        return perm.resourceId === null || perm.resourceId === resourceId;
      }

      return true;
    });

    if (!hasPermission) {
      return false;
    }

    // Verify the resource is within the admin's scope
    if (resourceId) {
      return this.isResourceInAdminScope(admin, resourceId);
    }

    return true;
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
        return this.isResourceInInstitution(admin.institutionId, resourceId);

      case 'FACULTY_ADMIN':
        return this.isResourceInFaculty(admin.facultyId, resourceId);

      case 'DEPARTMENT_ADMIN':
        return this.isResourceInDepartment(admin.departmentId, resourceId);

      case 'ORGANIZATION_ADMIN':
      case 'CLUB_ADMIN':
        return this.isResourceInOrganizationSession(admin, resourceId);

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

    const due = await this.prisma.due.findFirst({
      where: { id: resourceId, organizationId, sessionId: academicSessionId },
    });
    if (due) return true;

    const event = await this.prisma.event.findFirst({
      where: {
        id: resourceId,
        organizationId,
        organization: { academicSessionId },
      },
    });
    if (event) return true;

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
}
