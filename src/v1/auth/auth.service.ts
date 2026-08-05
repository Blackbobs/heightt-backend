// src/v1/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { PermissionService } from './permission.service';
import { RegisterDto, LoginDto } from './dto';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as useragent from 'useragent';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../redis/rate-limit.service';
import { OtpService } from '../../redis/otp.service';
import { CacheService } from '../../redis/cache.service';
import { EmailService } from '../../email/email.service';
import { PasswordUtil } from '../../common/utils/password.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly cookieService: CookieService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly otpService: OtpService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
    private readonly permissionService: PermissionService,
  ) {}

  async register(dto: RegisterDto, request: any) {
    this.logger.log(`Registration attempt for email: ${dto.email}`);

    // Check rate limit
    const rateLimitKey = `register:${request.ip}`;
    const rateLimit = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      10,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new BadRequestException(
        'Too many registration attempts. Please try again later.',
      );
    }

    // Check if email exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingEmail) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if username exists
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });

    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    // Hash password
    const hashedPassword = await PasswordUtil.hash(dto.password);

    // Create user
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          passwordHash: hashedPassword,
        },
      });

      // Create initial profile (will be filled during onboarding)
      await tx.userProfile.create({
        data: {
          userId: newUser.id,
          firstName: '',
          lastName: '',
          onboardingStep: 'PERSONAL_INFO',
          verificationStatus: 'UNVERIFIED',
        },
      });

      // Create email verification token
      const verificationToken = randomBytes(32).toString('hex');
      await tx.emailVerification.create({
        data: {
          userId: newUser.id,
          email: newUser.email,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: 'USER_REGISTERED',
          entity: 'User',
          entityId: newUser.id,
          metadata: { email: newUser.email, username: newUser.username },
        },
      });

      return newUser;
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.username);

    // Invalidate user cache
    await this.cacheService.invalidateUserCache(user.id);

    this.logger.log(`User registered successfully: ${user.id}`);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      message:
        'Registration successful. Please check your email for verification.',
    };
  }

  async login(dto: LoginDto, request: any, response: Response) {
    this.logger.log(`Login attempt for identifier: ${dto.identifier}`);

    // Check rate limit
    const rateLimitKey = `login:${request.ip}`;
    const attempts = await this.rateLimitService.checkLoginAttempts(
      rateLimitKey,
      this.configService.get('RATE_LIMIT_MAX_LOGIN_ATTEMPTS', 5),
      this.configService.get('RATE_LIMIT_WINDOW_MINUTES', 15),
    );

    if (!attempts.allowed) {
      throw new UnauthorizedException(
        'Too many login attempts. Please try again later.',
      );
    }

    // Find user by email OR username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier.toLowerCase() },
          { username: dto.identifier.toLowerCase() },
        ],
      },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (
      !user ||
      user.status === 'DELETED' ||
      user.status === 'INACTIVE' ||
      user.status === 'SUSPENDED'
    ) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await PasswordUtil.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset login attempts
    await this.rateLimitService.resetLoginAttempts(rateLimitKey);

    // Generate tokens
    const accessToken = await this.tokenService.generateAccessToken(
      user.id,
      user.email,
    );
    const refreshToken = await this.tokenService.generateRefreshToken(
      user.id,
      user.email,
    );
    const refreshTokenHash =
      await this.tokenService.hashRefreshToken(refreshToken);

    // Parse user agent
    const agent = useragent.parse(request.headers['user-agent'] || '');
    const browser = agent.family;
    const os = agent.os.family;

    // Create session
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        browser,
        operatingSystem: os,
        ipAddress: request.ip || request.headers['x-forwarded-for'] || '',
        userAgent: request.headers['user-agent'] || '',
        deviceName: `${browser} on ${os}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(),
        isActive: true,
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.id,
        metadata: { email: user.email, username: user.username },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });

    // Set cookies
    this.cookieService.setAccessTokenCookie(response, accessToken);
    this.cookieService.setRefreshTokenCookie(response, refreshToken);

    this.logger.log(`User logged in successfully: ${user.id}`);

    // Cache user profile with tags for invalidation
    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      profile: user.profile,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
    };
    
    await this.cacheService.cacheUserProfile(user.id, userData);
    // Also cache with tags for bulk invalidation
    await this.cacheService.setWithTag(
      `user:auth:${user.id}`,
      { sessionId: session.id, loggedInAt: new Date().toISOString() },
      ['auth', `user:${user.id}`],
      3600, // 1 hour
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
        onboardingStep: user.profile?.onboardingStep || 'PERSONAL_INFO',
        sessionId: session.id,
      },
    };
  }

  async refresh(request: any, response: Response) {
    const refreshToken = this.cookieService.getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    // Verify refresh token
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find session
    const session = await this.prisma.session.findFirst({
      where: {
        userId: payload.sub,
        isActive: true,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // Verify refresh token hash
    const isValid = await this.tokenService.verifyRefreshTokenHash(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate tokens
    const newAccessToken = await this.tokenService.generateAccessToken(
      session.userId,
      session.user.email,
    );
    const newRefreshToken = await this.tokenService.generateRefreshToken(
      session.userId,
      session.user.email,
    );
    const newRefreshTokenHash =
      await this.tokenService.hashRefreshToken(newRefreshToken);

    // Update session
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
      },
    });

    // Log refresh
    await this.prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'TOKEN_REFRESHED',
        entity: 'Session',
        entityId: session.id,
        metadata: { sessionId: session.id },
      },
    });

    // Set new cookies
    this.cookieService.setAccessTokenCookie(response, newAccessToken);
    this.cookieService.setRefreshTokenCookie(response, newRefreshToken);

    // Update session cache
    await this.cacheService.setWithTag(
      `user:auth:${session.userId}`,
      { sessionId: session.id, refreshedAt: new Date().toISOString() },
      ['auth', `user:${session.userId}`],
      3600,
    );

    this.logger.log(`Token refreshed for user: ${session.userId}`);

    return { message: 'Tokens refreshed successfully' };
  }

  async logout(request: any, response: Response) {
    const refreshToken = this.cookieService.getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      this.cookieService.clearAllCookies(response);
      return { message: 'Logged out successfully' };
    }

    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (payload) {
      // Find and revoke session
      const session = await this.prisma.session.findFirst({
        where: {
          userId: payload.sub,
          isActive: true,
          revokedAt: null,
        },
      });

      if (session) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            revokedAt: new Date(),
            isActive: false,
          },
        });

        await this.prisma.auditLog.create({
          data: {
            userId: payload.sub,
            action: 'USER_LOGOUT',
            entity: 'Session',
            entityId: session.id,
          },
        });

        // Invalidate auth cache
        await this.cacheService.invalidateUserCache(payload.sub);
        await this.cacheService.invalidateByTag(`user:${payload.sub}`);
        await this.cacheService.invalidateByTag('auth');
      }
    }

    // Clear cookies
    this.cookieService.clearAllCookies(response);

    this.logger.log(`User logged out successfully`);

    return { message: 'Logged out successfully' };
  }

  async logoutAll(request: any, response: Response) {
    const refreshToken = this.cookieService.getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      this.cookieService.clearAllCookies(response);
      return { message: 'Logged out from all devices' };
    }

    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (payload) {
      // Revoke all sessions
      const sessions = await this.prisma.session.updateMany({
        where: {
          userId: payload.sub,
          isActive: true,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          isActive: false,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          userId: payload.sub,
          action: 'USER_LOGOUT_ALL',
          entity: 'User',
          entityId: payload.sub,
          metadata: { sessionsRevoked: sessions.count },
        },
      });

      // Invalidate all auth cache
      await this.cacheService.invalidateUserCache(payload.sub);
      await this.cacheService.invalidateByTag(`user:${payload.sub}`);
      await this.cacheService.invalidateByTag('auth');
    }

    // Clear cookies
    this.cookieService.clearAllCookies(response);

    this.logger.log(`User logged out from all devices`);

    return { message: 'Logged out from all devices' };
  }

  async verifyEmail(token: string) {
    this.logger.log(`Verifying email with token: ${token.substring(0, 10)}...`);

    // Find the verification record
    const verification = await this.prisma.emailVerification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification token');
    }

    // Check if already verified
    if (verification.verifiedAt) {
      throw new BadRequestException('Email already verified');
    }

    // Check if token is expired
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    // Update user and verification record in transaction
    await this.prisma.$transaction([
      // Mark user as verified
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerified: true },
      }),
      // Mark verification as used
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedAt: new Date() },
      }),
      // Update user profile verification status
      this.prisma.userProfile.update({
        where: { userId: verification.userId },
        data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
      }),
      // Log the action
      this.prisma.auditLog.create({
        data: {
          userId: verification.userId,
          action: 'EMAIL_VERIFIED',
          entity: 'User',
          entityId: verification.userId,
          metadata: { email: verification.email },
        },
      }),
    ]);

    // Send welcome email
    await this.emailService.sendWelcomeEmail(
      verification.user.email,
      verification.user.username,
    );

    // Invalidate user cache
    await this.cacheService.invalidateUserCache(verification.userId);

    this.logger.log(
      `Email verified successfully for user: ${verification.userId}`,
    );

    return {
      message: 'Email verified successfully',
      email: verification.email,
    };
  }

  async resendVerificationEmail(email: string) {
    this.logger.log(`Resending verification email to: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Delete old verification tokens
    await this.prisma.emailVerification.deleteMany({
      where: {
        userId: user.id,
        verifiedAt: null,
      },
    });

    // Create new verification token
    const verificationToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        email: user.email,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.username);

    this.logger.log(`Verification email resent to: ${email}`);

    return {
      message: 'Verification email sent successfully. Please check your inbox.',
    };
  }

  async getCurrentUser(userId: string) {
    // Check cache first
    const cached = await this.cacheService.getUserProfile(userId);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      profile: user.profile,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
      onboardingStep: user.profile?.onboardingStep || 'PERSONAL_INFO',
    };

    // Cache for 5 minutes with tags
    await this.cacheService.cacheUserProfile(userId, userData);
    await this.cacheService.setWithTag(
      `user:profile:${userId}`,
      userData,
      ['users', `user:${userId}`],
      300,
    );

    return userData;
  }

  async getSessions(userId: string) {
    const cacheKey = `user:sessions:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        revokedAt: null,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
      select: {
        id: true,
        deviceName: true,
        browser: true,
        operatingSystem: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    // Cache for 1 minute (sessions change frequently)
    await this.cacheService.set(cacheKey, sessions, 60);

    return sessions;
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        isActive: true,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        isActive: false,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'SESSION_REVOKED',
        entity: 'Session',
        entityId: sessionId,
      },
    });

    // Invalidate session cache
    await this.cacheService.delete(`user:sessions:${userId}`);
    await this.cacheService.invalidateByTag(`user:${userId}`);

    return { message: 'Session revoked successfully' };
  }

  async isAdmin(userId: string): Promise<boolean> {
    // Cache admin status
    const cacheKey = `user:admin:${userId}`;
    const cached = await this.cacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const admin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });
    
    const isAdmin = !!admin;
    await this.cacheService.set(cacheKey, isAdmin, 300); // 5 minutes

    return isAdmin;
  }

  async getAdminType(userId: string): Promise<string | null> {
    const cacheKey = `user:adminType:${userId}`;
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const admin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });
      const adminType = admin?.adminType || null;
      await this.cacheService.set(cacheKey, adminType, 300);
      return adminType;
    } catch {
      return null;
    }
  }

  async hasPermission(
    userId: string,
    permission: string,
    resourceId?: string,
  ): Promise<boolean> {
    return this.permissionService.checkPermission(
      userId,
      permission,
      resourceId,
    );
  }

  async getAdminScope(userId: string): Promise<{
    adminType?: string;
    institutionId?: string;
    facultyId?: string;
    departmentId?: string;
    organizationId?: string;
  } | null> {
    const cacheKey = `user:adminScope:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

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

      const scope = {
        adminType: admin.adminType,
        institutionId: admin.institutionId || undefined,
        facultyId: admin.facultyId || undefined,
        departmentId: admin.departmentId || undefined,
        organizationId: admin.organizationId || undefined,
      };

      await this.cacheService.set(cacheKey, scope, 300);
      return scope;
    } catch {
      return null;
    }
  }

  async canAccessResource(
    userId: string,
    resourceType:
      | 'institution'
      | 'faculty'
      | 'department'
      | 'organization'
      | 'student',
    resourceId: string,
  ): Promise<boolean> {
    const admin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    if (!admin) {
      return false;
    }

    if (admin.adminType === 'PLATFORM_ADMIN') {
      return true;
    }

    switch (resourceType) {
      case 'institution':
        return admin.institutionId === resourceId;
      case 'faculty':
        return (
          admin.facultyId === resourceId || admin.institutionId === resourceId
        );
      case 'department':
        return (
          admin.departmentId === resourceId || admin.facultyId === resourceId
        );
      case 'organization':
        return admin.organizationId === resourceId;
      case 'student':
        const student = await this.prisma.studentProfile.findUnique({
          where: { id: resourceId },
          select: { institutionId: true, facultyId: true, departmentId: true },
        });
        if (!student) return false;

        if (
          admin.adminType === 'INSTITUTION_ADMIN' &&
          admin.institutionId === student.institutionId
        ) {
          return true;
        }
        if (
          admin.adminType === 'FACULTY_ADMIN' &&
          admin.facultyId === student.facultyId
        ) {
          return true;
        }
        if (
          admin.adminType === 'DEPARTMENT_ADMIN' &&
          admin.departmentId === student.departmentId
        ) {
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    return this.permissionService.getUserPermissions(userId);
  }

  async hasAnyPermission(
    userId: string,
    permissions: string[],
  ): Promise<boolean> {
    return this.permissionService.hasAnyPermission(userId, permissions);
  }

  async checkPermissions(
    userId: string,
    permissions: string[],
  ): Promise<{ [key: string]: boolean }> {
    return this.permissionService.checkPermissions(userId, permissions);
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateAuthCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        await this.cacheService.invalidateUserCache(userId);
        await this.cacheService.invalidateByTag(`user:${userId}`);
        await this.cacheService.delete(`user:sessions:${userId}`);
        await this.cacheService.delete(`user:admin:${userId}`);
        await this.cacheService.delete(`user:adminType:${userId}`);
        await this.cacheService.delete(`user:adminScope:${userId}`);
        await this.cacheService.delete(`user:auth:${userId}`);
        await this.cacheService.delete(`user:profile:${userId}`);
        await this.cacheService.delete(`auth:user:${userId}`);
      }
      
      await this.cacheService.invalidateByTag('auth');
      await this.cacheService.invalidateByTag('users');
      
      this.logger.log(`Auth cache invalidated${userId ? ` for user: ${userId}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate auth cache: ${error.message}`);
    }
  }
}