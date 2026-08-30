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

      // Check for other resource IDs
      const facultyId = request.params?.facultyId || request.query?.facultyId;
      const departmentId =
        request.params?.departmentId || request.query?.departmentId;
      const institutionId =
        request.params?.institutionId || request.query?.institutionId;

      // Find the admin that matches the scope of the request
      let matchingAdmin: any = null;

      // If organizationId is provided, find admin for that organization
      if (organizationId) {
        const found = admins.find(
          (admin) => admin.organizationId === organizationId,
        );
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
        // Check if any admin's scope includes this organization
        for (const admin of admins) {
          if (admin.adminType === 'PLATFORM_ADMIN') {
            matchingAdmin = admin;
            break;
          }

          // Check if this organization belongs to the admin's institution
          if (admin.institutionId) {
            const org = await this.prisma.organization.findUnique({
              where: { id: organizationId },
              select: { institutionId: true },
            });
            if (org && org.institutionId === admin.institutionId) {
              matchingAdmin = admin;
              break;
            }
          }

          // Check if this organization belongs to the admin's faculty
          if (admin.facultyId) {
            const org = await this.prisma.organization.findUnique({
              where: { id: organizationId },
              select: { facultyId: true },
            });
            if (org && org.facultyId === admin.facultyId) {
              matchingAdmin = admin;
              break;
            }
          }

          // Check if this organization belongs to the admin's department
          if (admin.departmentId) {
            const org = await this.prisma.organization.findUnique({
              where: { id: organizationId },
              select: { departmentId: true },
            });
            if (org && org.departmentId === admin.departmentId) {
              matchingAdmin = admin;
              break;
            }
          }
        }
      }

      // If no specific scope match, use the first admin (fallback)
      // But log a warning because this could indicate a permission issue
      if (!matchingAdmin) {
        this.logger.warn(
          `User ${user.id} has multiple admin roles but none match the request scope. Using first admin: ${admins[0].adminType}`,
        );
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
        const hasPermission = await this.checkPermissionForAdmin(
          matchingAdmin,
          requiredPermission,
          resourceId,
        );

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
        // Include all admins for multi-scope support
        allAdmins: admins.map((a) => ({
          id: a.id,
          type: a.adminType,
          institutionId: a.institutionId,
          facultyId: a.facultyId,
          departmentId: a.departmentId,
          organizationId: a.organizationId,
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
        return this.isResourceInOrganization(admin.organizationId, resourceId);

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

  private async isResourceInOrganization(
    organizationId: string,
    resourceId: string,
  ): Promise<boolean> {
    if (organizationId === resourceId) return true;

    // Check if resource is a membership in this organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: resourceId, organizationId },
    });
    if (membership) return true;

    return false;
  }
}
