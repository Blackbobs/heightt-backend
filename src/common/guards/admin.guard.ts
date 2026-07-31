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

// Remove the AdminType import

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
      // Check if user has any admin role
      const admin = await (this.prisma as any).admin.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
        include: {
          permissions: true,
        },
      });

      if (!admin) {
        this.logger.warn(
          `User ${user.id} attempted to access admin endpoint without admin privileges`,
        );
        throw new ForbiddenException('Admin access required');
      }

      // Check for admin type requirements
      const requiredAdminTypes = this.reflector.get<string[]>(
        'adminTypes',
        context.getHandler(),
      );

      if (requiredAdminTypes && requiredAdminTypes.length > 0) {
        if (!requiredAdminTypes.includes(admin.adminType)) {
          this.logger.warn(
            `User ${user.id} with admin type ${admin.adminType} does not have required admin type`,
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

        const hasPermission = await this.permissionService.checkPermission(
          user.id,
          requiredPermission,
          resourceId,
        );

        if (!hasPermission) {
          this.logger.warn(
            `User ${user.id} does not have permission: ${requiredPermission}`,
          );
          throw new ForbiddenException(
            `Missing required permission: ${requiredPermission}`,
          );
        }
      }

      // Attach admin info to request for use in controllers
      request.admin = {
        id: admin.id,
        type: admin.adminType,
        institutionId: admin.institutionId,
        facultyId: admin.facultyId,
        departmentId: admin.departmentId,
        organizationId: admin.organizationId,
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
}
