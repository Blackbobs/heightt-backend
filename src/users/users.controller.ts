import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  UserResponseDto,
  UserListResponseDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get all users (Admin only)',
    description:
      'Returns a paginated list of all users with filtering options.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Items per page',
  })
  @ApiQuery({ name: 'email', required: false, description: 'Filter by email' })
  @ApiQuery({
    name: 'username',
    required: false,
    description: 'Filter by username',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'createdAfter',
    required: false,
    description: 'Filter by creation date (start)',
  })
  @ApiQuery({
    name: 'createdBefore',
    required: false,
    description: 'Filter by creation date (end)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Users retrieved successfully',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('email') email?: string,
    @Query('username') username?: string,
    @Query('status') status?: string,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
  ) {
    this.logger.log('Get all users endpoint called');
    return this.usersService.findAll(parseInt(page, 10), parseInt(limit, 10), {
      email,
      username,
      status,
      createdAfter,
      createdBefore,
    });
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: "Returns the authenticated user's full profile information.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized',
  })
  async getCurrentUser(@Request() req: any) {
    this.logger.log(
      `Get current user endpoint called for user: ${req.user.id}`,
    );
    return this.usersService.findById(req.user.id);
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get user statistics (Admin only)',
    description:
      'Returns user statistics including counts by status and verification.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User statistics retrieved',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getUserStats() {
    this.logger.log('Get user stats endpoint called');
    return this.usersService.getUserStats();
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'Get user sessions',
    description: 'Returns all active sessions for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessions retrieved',
  })
  async getUserSessions(@Request() req: any) {
    this.logger.log(`Get sessions endpoint called for user: ${req.user.id}`);
    return this.usersService.getUserSessions(req.user.id);
  }

  @Delete('sessions')
  @ApiOperation({
    summary: 'Revoke all sessions',
    description: 'Revokes all active sessions for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All sessions revoked',
  })
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(@Request() req: any) {
    this.logger.log(
      `Revoke all sessions endpoint called for user: ${req.user.id}`,
    );
    return this.usersService.revokeAllSessions(req.user.id);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: "Updates the authenticated user's profile information.",
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Username already taken',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async updateProfile(@Request() req: any, @Body() dto: UpdateUserDto) {
    this.logger.log(`Update profile endpoint called for user: ${req.user.id}`);
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get user by ID (Admin only)',
    description: 'Returns user details by ID with full profile.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User retrieved',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async findById(@Param('id') id: string) {
    this.logger.log(`Get user by ID endpoint called: ${id}`);
    return this.usersService.findById(id);
  }

  @Get('email/:email')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get user by email (Admin only)',
    description: 'Returns user details by email.',
  })
  @ApiParam({ name: 'email', description: 'User email address' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User retrieved',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async findByEmail(@Param('email') email: string) {
    this.logger.log(`Get user by email endpoint called: ${email}`);
    return this.usersService.findByEmail(email);
  }

  @Patch(':id/status')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update user status (Admin only)',
    description:
      "Updates a user's status (ACTIVE, INACTIVE, SUSPENDED, DELETED).",
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User status updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    this.logger.log(
      `Update user status endpoint called: ${id} -> ${dto.status}`,
    );
    return this.usersService.updateStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Delete user (Admin only)',
    description: 'Soft deletes a user (sets status to DELETED).',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    this.logger.log(`Delete user endpoint called: ${id}`);
    return this.usersService.deleteUser(id);
  }

  @Delete(':id/sessions')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Revoke all sessions for a user (Admin only)',
    description: 'Revokes all active sessions for a specific user.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessions revoked',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  @HttpCode(HttpStatus.OK)
  async revokeUserSessions(@Param('id') id: string) {
    this.logger.log(`Revoke user sessions endpoint called: ${id}`);
    return this.usersService.revokeAllSessions(id);
  }
}
