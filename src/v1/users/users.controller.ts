import {
  Controller,
  Get,
  Patch,
  Post,
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
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  UserResponseDto,
  UserListResponseDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UsernameAvailabilityResponseDto,
  EmailAvailabilityResponseDto,
} from './dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================
  // USERNAME AVAILABILITY CHECK
  // ============================================

  @Get('check-username')
  @ApiOperation({
    summary: 'Check username availability',
    description: 'Check if a username is available for registration or update',
  })
  @ApiQuery({
    name: 'username',
    description: 'Username to check',
    required: true,
    example: 'john_doe',
  })
  @ApiQuery({
    name: 'excludeUserId',
    description: 'Optional user ID to exclude from the check (for updates)',
    required: false,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Username availability status',
    type: UsernameAvailabilityResponseDto,
  })
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { username, excludeUserId } = request.query;
      return `username:check:${username}:${excludeUserId || 'none'}`;
    },
    ttl: 60, // 1 minute cache
    tags: ['users', 'username'],
  })
  async checkUsernameAvailability(
    @Query('username') username: string,
    @Query('excludeUserId') excludeUserId?: string,
  ) {
    if (!username || username.trim().length === 0) {
      return {
        available: false,
        username,
        message: 'Username is required',
        suggestions: [],
      };
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return {
        available: false,
        username,
        message:
          'Username must be 3-30 characters and can only contain letters, numbers, underscores, dots, and hyphens',
        suggestions: [],
      };
    }

    const result = await this.usersService.checkUsernameAvailability(
      username,
      excludeUserId,
    );

    // Generate suggestions if username is taken and no excludeUserId (for new registrations)
    let suggestions: string[] = [];
    if (!result.available && !excludeUserId) {
      suggestions =
        await this.usersService.generateUsernameSuggestions(username);
    }

    return {
      ...result,
      suggestions,
    };
  }

  // ============================================
  // EMAIL AVAILABILITY CHECK
  // ============================================

  @Get('check-email')
  @ApiOperation({
    summary: 'Check email availability',
    description: 'Check if an email is available for registration or update',
  })
  @ApiQuery({
    name: 'email',
    description: 'Email to check',
    required: true,
    example: 'user@example.com',
  })
  @ApiQuery({
    name: 'excludeUserId',
    description: 'Optional user ID to exclude from the check (for updates)',
    required: false,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email availability status',
    type: EmailAvailabilityResponseDto,
  })
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { email, excludeUserId } = request.query;
      return `email:check:${email}:${excludeUserId || 'none'}`;
    },
    ttl: 60,
    tags: ['users', 'email'],
  })
  async checkEmailAvailability(
    @Query('email') email: string,
    @Query('excludeUserId') excludeUserId?: string,
  ) {
    if (!email || email.trim().length === 0) {
      return {
        available: false,
        email,
        message: 'Email is required',
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        available: false,
        email,
        message: 'Invalid email format',
      };
    }

    return this.usersService.checkEmailAvailability(email, excludeUserId);
  }

  // ============================================
  // EXISTING USER ENDPOINTS
  // ============================================

  @Get()
  @UseGuards(AdminGuard)
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const {
        page,
        limit,
        email,
        username,
        status,
        createdAfter,
        createdBefore,
      } = request.query;
      return `users:${page || 1}:${limit || 10}:${email || 'all'}:${username || 'all'}:${status || 'all'}:${createdAfter || 'all'}:${createdBefore || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['users'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:profile:${request.user.id}`;
    },
    ttl: 120, // 2 minutes
    tags: ['users', 'user'],
  })
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
  @Cache({
    key: () => 'users:stats',
    ttl: 600, // 10 minutes
    tags: ['users', 'stats'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:sessions:${request.user.id}`;
    },
    ttl: 60, // 1 minute
    tags: ['users', 'sessions'],
  })
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
  @InvalidateCache(['users', 'sessions'])
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
  @InvalidateCache(['users', 'user'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:profile:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['users'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:email:${request.params.email}`;
    },
    ttl: 300, // 5 minutes
    tags: ['users'],
  })
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
  @InvalidateCache(['users', 'user', 'stats'])
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

  @Get('me/organizations')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `user:${request.user.id}:organizations`;
    },
    ttl: 120,
    tags: ['users', 'organizations'],
  })
  @ApiOperation({ summary: 'Get user organizations' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organizations retrieved',
  })
  async getUserOrganizations(@Request() req: any) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true,
            status: true,
          },
        },
      },
    });
    return memberships;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @InvalidateCache(['users', 'user', 'stats'])
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
  @InvalidateCache(['users', 'sessions'])
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

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Invalidate users cache (Admin only)',
    description: 'Clear all users-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Specific user to invalidate (optional)',
        },
        reason: {
          type: 'string',
          description: 'Reason for invalidating cache',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Users cache invalidated',
  })
  @InvalidateCache(['users', 'user', 'stats', 'sessions'])
  async invalidateUsersCache(
    @Body() body: { userId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate users cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.usersService.invalidateUsersCache(body.userId);

    return {
      message: 'Users cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      userId: body.userId || 'all users',
    };
  }
}
