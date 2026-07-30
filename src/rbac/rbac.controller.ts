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
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../common/guards/admin.guard';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleToUserDto,
  AssignAdminRoleDto,
  RoleResponseDto,
  PermissionResponseDto,
} from './dto/role.dto';

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
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permissions retrieved',
    type: [PermissionResponseDto],
  })
  async getAllPermissions() {
    return this.rbacService.getAllPermissions();
  }

  @Get('permissions/:key')
  @RequirePermission('admin:view')
  @ApiOperation({ summary: 'Get permission by key' })
  @ApiParam({ name: 'key', description: 'Permission key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission retrieved',
    type: PermissionResponseDto,
  })
  async getPermissionByKey(@Param('key') key: string) {
    return this.rbacService.getPermissionByKey(key);
  }

  // ============================================
  // ROLES
  // ============================================

  @Post('roles')
  @RequirePermission('admin:assign')
  @ApiOperation({ summary: 'Create role' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Role created',
    type: RoleResponseDto,
  })
  async createRole(@Request() req: any, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(req.user.id, dto);
  }

  @Get('roles')
  @RequirePermission('admin:view')
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
    return this.rbacService.getRolesByOrganization(organizationId);
  }

  @Get('roles/:id')
  @RequirePermission('admin:view')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role retrieved',
    type: RoleResponseDto,
  })
  async getRoleById(@Param('id') id: string) {
    return this.rbacService.getRoleById(id);
  }

  @Patch('roles/:id')
  @RequirePermission('admin:assign')
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
    return this.rbacService.updateRole(id, req.user.id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('admin:assign')
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role deleted',
  })
  async deleteRole(@Param('id') id: string, @Request() req: any) {
    return this.rbacService.deleteRole(id, req.user.id);
  }

  // ============================================
  // USER ROLE ASSIGNMENT
  // ============================================

  @Post('users/assign-role')
  @RequirePermission('admin:assign')
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
    return this.rbacService.assignRoleToUser(req.user.id, dto);
  }

  @Delete('users/roles/:membershipRoleId')
  @RequirePermission('admin:assign')
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
    return this.rbacService.removeRoleFromUser(membershipRoleId, req.user.id);
  }

  // ============================================
  // ADMIN ASSIGNMENT
  // ============================================

  @Post('admins/assign')
  @RequirePermission('admin:assign')
  @ApiOperation({ summary: 'Assign admin role' })
  @ApiBody({ type: AssignAdminRoleDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin role assigned',
  })
  async assignAdminRole(@Request() req: any, @Body() dto: AssignAdminRoleDto) {
    return this.rbacService.assignAdminRole(req.user.id, dto);
  }

  @Post('admins/:adminId/revoke')
  @RequirePermission('admin:assign')
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
    return this.rbacService.revokeAdminRole(adminId, req.user.id);
  }

  @Get('admins')
  @RequirePermission('admin:view')
  @ApiOperation({ summary: 'Get all admins' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admins retrieved',
  })
  async getAdmins() {
    return this.rbacService.getAdmins();
  }

  @Get('users/:userId/permissions')
  @RequirePermission('admin:view')
  @ApiOperation({ summary: 'Get user permissions' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User permissions retrieved',
  })
  async getUserPermissions(@Param('userId') userId: string) {
    return this.rbacService.getUserPermissions(userId);
  }
}
