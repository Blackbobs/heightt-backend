// src/v1/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Request,
  Res,
  Get,
  Delete,
  Param,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto';
import type { Response } from 'express';
// Import cache decorators
import { Cache, Cacheable, CacheKey, InvalidateCache } from '../../common/decorators/cache.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @InvalidateCache(['auth', 'users']) // Invalidate auth caches on registration
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account with email, username, and password. Sends verification email.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiConflictResponse({ description: 'Email or username already exists' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async register(@Body() dto: RegisterDto, @Request() req: any) {
    this.logger.log(`Register endpoint called for email: ${dto.email}`);
    return this.authService.register(dto, req);
  }

  @Post('login')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth']) // Invalidate auth caches on login
  @ApiOperation({
    summary: 'Login user',
    description:
      'Authenticates a user using email/username and password. Sets HTTP-only cookies.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async login(
    @Body() dto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(`Login endpoint called for identifier: ${dto.identifier}`);
    return this.authService.login(dto, req, res);
  }

  @Post('refresh')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth']) // Invalidate auth caches on refresh
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Uses refresh token from HTTP-only cookie to generate new access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'Tokens refreshed successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log('Refresh token endpoint called');
    return this.authService.refresh(req, res);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth', 'users']) // Invalidate auth caches on logout
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Revokes the current session and clears authentication cookies.',
  })
  @ApiOkResponse({ description: 'Logged out successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    this.logger.log('Logout endpoint called');
    return this.authService.logout(req, res);
  }

  @Post('logout-all')
  @UseGuards(JwtGuard)
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth', 'users']) // Invalidate auth caches on logout all
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout from all devices',
    description:
      'Revokes all active sessions and clears authentication cookies.',
  })
  @ApiOkResponse({ description: 'Logged out from all devices' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async logoutAll(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log('Logout all devices endpoint called');
    return this.authService.logoutAll(req, res);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @Version('1')
  @Cacheable(300, ['users']) // Cache for 5 minutes with 'users' tag
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user',
    description: "Returns the authenticated user's profile information.",
  })
  @ApiOkResponse({
    description: 'User profile retrieved',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getCurrentUser(@Request() req: any) {
    this.logger.log('Get current user endpoint called');
    return this.authService.getCurrentUser(req.user.id);
  }

  @Get('sessions')
  @UseGuards(JwtGuard)
  @Version('1')
  @CacheKey((context) => {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.id;
    return `user:sessions:${userId}`;
  })
  @Cache({ ttl: 60, tags: ['auth', 'sessions'] }) // 1 minute
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get active sessions',
    description: 'Returns all active sessions for the authenticated user.',
  })
  @ApiOkResponse({ description: 'Sessions retrieved' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getSessions(@Request() req: any) {
    this.logger.log('Get sessions endpoint called');
    return this.authService.getSessions(req.user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtGuard)
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  @InvalidateCache(['auth', 'sessions']) // Invalidate session caches
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Revoke a session',
    description: 'Revokes a specific session by ID.',
  })
  @ApiNoContentResponse({ description: 'Session revoked successfully' })
  @ApiNotFoundResponse({ description: 'Session not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async revokeSession(@Request() req: any, @Param('id') id: string) {
    this.logger.log('Revoke session endpoint called');
    return this.authService.revokeSession(req.user.id, id);
  }

  @Post('verify-email')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth', 'users']) // Invalidate caches on email verification
  @ApiOperation({
    summary: 'Verify email address',
    description:
      "Verifies user's email using the verification token sent via email.",
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u',
          description: 'Verification token received via email',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Email verified successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired token' })
  async verifyEmail(@Body() body: { token: string }) {
    this.logger.log('Verify email endpoint called');
    return this.authService.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['auth', 'users']) // Invalidate caches on resend
  @ApiOperation({
    summary: 'Resend verification email',
    description: 'Resends the email verification link to the user.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'john@example.com',
          description: 'User email address',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Verification email sent successfully' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Email already verified' })
  async resendVerification(@Body() body: { email: string }) {
    this.logger.log(`Resend verification email called for: ${body.email}`);
    return this.authService.resendVerificationEmail(body.email);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(JwtGuard)
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Invalidate auth cache (Admin only)',
    description: 'Clear all authentication-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Specific user to invalidate (optional)' },
        reason: { type: 'string', description: 'Reason for invalidating cache' },
      },
    },
  })
  @ApiOkResponse({ description: 'Auth cache invalidated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async invalidateAuthCache(
    @Body() body: { userId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(`Invalidate auth cache endpoint called. Reason: ${body.reason || 'Not specified'}`);
    
    await this.authService.invalidateAuthCache(body.userId);
    
    return {
      message: 'Auth cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      userId: body.userId || 'all users',
    };
  }
}