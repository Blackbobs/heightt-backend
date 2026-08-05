// src/v1/rbac/rbac.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { RbacService } from './rbac.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleToUserDto,
  AssignAdminRoleDto,
  RoleResponseDto,
  PermissionResponseDto,
} from './dto/role.dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('rbac')
@Controller('rbac')
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class RbacController {
  private readonly logger = new Logger(RbacController.name);

  constructor(private readonly rbacService: RbacService) {}

  // ============================================
  // PERMISSIONS
  // ============================================

  @Get('permissions')
  @RequirePermission('admin:view')
  @Cache({
    key: () => 'permissions:all',
    ttl: 600, // 10 minutes
    tags: ['rbac', 'permissions'],
  })
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permissions retrieved',
    type: [PermissionResponseDto],
  })
  async getAllPermissions() {
    this.logger.log('Get all permissions endpoint called');
    return this.rbacService.getAllPermissions();
  }

  @Get('permissions/:key')
  @RequirePermission('admin:view')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `permission:${request.params.key}`;
    },
    ttl: 600, // 10 minutes
    tags: ['rbac', 'permissions'],
  })
  @ApiOperation({ summary: 'Get permission by key' })
  @ApiParam({ name: 'key', description: 'Permission key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission retrieved',
    type: PermissionResponseDto,
  })
  async getPermissionByKey(@Param('key') key: string) {
    this.logger.log(`Get permission by key endpoint called: ${key}`);
    return this.rbacService.getPermissionByKey(key);
  }

  // ============================================
  // ROLES
  // ============================================

  @Post('roles')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'roles'])
  @ApiOperation({ summary: 'Create role' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Role created',
    type: RoleResponseDto,
  })
  async createRole(@Request() req: any, @Body() dto: CreateRoleDto) {
    this.logger.log('Create role endpoint called');
    return this.rbacService.createRole(req.user.id, dto);
  }

  @Get('roles')
  @RequirePermission('admin:view')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `roles:organization:${request.query.organizationId}`;
    },
    ttl: 300, // 5 minutes
    tags: ['rbac', 'roles'],
  })
  @ApiOperation({ summary: 'Get roles by organization' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Roles retrieved',
    type: [RoleResponseDto],
  })
  async getRolesByOrganization(
    @Query('organizationId') organizationId: string,
  ) {
    this.logger.log(
      `Get roles by organization endpoint called: ${organizationId}`,
    );
    return this.rbacService.getRolesByOrganization(organizationId);
  }

  @Get('roles/:id')
  @RequirePermission('admin:view')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `role:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['rbac', 'roles'],
  })
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role retrieved',
    type: RoleResponseDto,
  })
  async getRoleById(@Param('id') id: string) {
    this.logger.log(`Get role by ID endpoint called: ${id}`);
    return this.rbacService.getRoleById(id);
  }

  @Patch('roles/:id')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'roles'])
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role updated',
    type: RoleResponseDto,
  })
  async updateRole(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateRoleDto,
  ) {
    this.logger.log(`Update role endpoint called: ${id}`);
    return this.rbacService.updateRole(id, req.user.id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'roles'])
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role deleted',
  })
  async deleteRole(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete role endpoint called: ${id}`);
    return this.rbacService.deleteRole(id, req.user.id);
  }

  // ============================================
  // USER ROLE ASSIGNMENT
  // ============================================

  @Post('users/assign-role')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'roles', 'permissions', 'user'])
  @ApiOperation({ summary: 'Assign role to user' })
  @ApiBody({ type: AssignRoleToUserDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role assigned',
  })
  async assignRoleToUser(
    @Request() req: any,
    @Body() dto: AssignRoleToUserDto,
  ) {
    this.logger.log('Assign role to user endpoint called');
    return this.rbacService.assignRoleToUser(req.user.id, dto);
  }

  @Delete('users/roles/:membershipRoleId')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'roles', 'permissions', 'user'])
  @ApiOperation({ summary: 'Remove role from user' })
  @ApiParam({ name: 'membershipRoleId', description: 'Membership role ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role removed',
  })
  async removeRoleFromUser(
    @Param('membershipRoleId') membershipRoleId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Remove role from user endpoint called: ${membershipRoleId}`,
    );
    return this.rbacService.removeRoleFromUser(membershipRoleId, req.user.id);
  }

  // ============================================
  // ADMIN ASSIGNMENT
  // ============================================

  @Post('admins/assign')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'admins'])
  @ApiOperation({ summary: 'Assign admin role' })
  @ApiBody({ type: AssignAdminRoleDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin role assigned',
  })
  async assignAdminRole(@Request() req: any, @Body() dto: AssignAdminRoleDto) {
    this.logger.log('Assign admin role endpoint called');
    return this.rbacService.assignAdminRole(req.user.id, dto);
  }

  @Post('admins/:adminId/revoke')
  @RequirePermission('admin:assign')
  @InvalidateCache(['rbac', 'admins'])
  @ApiOperation({ summary: 'Revoke admin role' })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin role revoked',
  })
  async revokeAdminRole(
    @Param('adminId') adminId: string,
    @Request() req: any,
  ) {
    this.logger.log(`Revoke admin role endpoint called: ${adminId}`);
    return this.rbacService.revokeAdminRole(adminId, req.user.id);
  }

  @Get('admins')
  @RequirePermission('admin:view')
  @Cache({
    key: () => 'admins:all',
    ttl: 300, // 5 minutes
    tags: ['rbac', 'admins'],
  })
  @ApiOperation({ summary: 'Get all admins' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admins retrieved',
  })
  async getAdmins() {
    this.logger.log('Get admins endpoint called');
    return this.rbacService.getAdmins();
  }

  @Get('users/:userId/permissions')
  @RequirePermission('admin:view')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:permissions:${request.params.userId}`;
    },
    ttl: 120, // 2 minutes
    tags: ['rbac', 'permissions', 'user'],
  })
  @ApiOperation({ summary: 'Get user permissions' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User permissions retrieved',
  })
  async getUserPermissions(@Param('userId') userId: string) {
    this.logger.log(`Get user permissions endpoint called: ${userId}`);
    return this.rbacService.getUserPermissions(userId);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @RequirePermission('admin:manage')
  @InvalidateCache(['rbac', 'permissions', 'roles', 'admins', 'user'])
  @ApiOperation({
    summary: 'Invalidate RBAC cache (Admin only)',
    description: 'Clear all RBAC-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for invalidating cache',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'RBAC cache invalidated',
  })
  async invalidateRbacCache(
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate RBAC cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.rbacService.invalidateRbacCache();

    return {
      message: 'RBAC cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
    };
  }
}
