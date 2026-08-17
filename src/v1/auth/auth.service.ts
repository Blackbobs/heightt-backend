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

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new ConflictException('User with this email already exists');
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    const hashedPassword = await PasswordUtil.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          passwordHash: hashedPassword,
        },
      });

      await tx.userProfile.create({
        data: {
          userId: newUser.id,
          firstName: '',
          lastName: '',
          onboardingStep: 'PERSONAL_INFO',
          verificationStatus: 'UNVERIFIED',
        },
      });

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

    const verification = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (verification) {
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
      const verificationLink = `${frontendUrl}/verify-email?token=${verification.token}`;

      await this.emailService.sendVerificationEmailWithLink(
        user.email,
        user.username,
        verificationLink,
      );
    }

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

  async verifyEmail(token: string) {
    this.logger.log(`Verifying email with token: ${token.substring(0, 10)}...`);

    const verification = await this.prisma.emailVerification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification token');
    }

    if (verification.verifiedAt) {
      throw new BadRequestException('Email already verified');
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedAt: new Date() },
      }),
      this.prisma.userProfile.update({
        where: { userId: verification.userId },
        data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
      }),
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

    await this.emailService.sendWelcomeEmail(
      verification.user.email,
      verification.user.username,
    );

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

    await this.prisma.emailVerification.deleteMany({
      where: {
        userId: user.id,
        verifiedAt: null,
      },
    });

    const verificationToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        email: user.email,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
    const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

    await this.emailService.sendVerificationEmailWithLink(
      user.email,
      user.username,
      verificationLink,
    );

    this.logger.log(`Verification email resent to: ${email}`);

    return {
      message: 'Verification email sent successfully. Please check your inbox.',
    };
  }

  async login(dto: LoginDto, request: any, response: Response) {
    this.logger.log(`Login attempt for identifier: ${dto.identifier}`);

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

    const isValidPassword = await PasswordUtil.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.rateLimitService.resetLoginAttempts(rateLimitKey);

    // Parse user agent
    const agent = useragent.parse(request.headers['user-agent'] || '');
    const browser = agent.family;
    const os = agent.os.family;

    // Create session with refreshTokenHash placeholder
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending', // Placeholder, will be updated after token generation
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

    // Generate tokens with session ID
    const accessToken = await this.tokenService.generateAccessToken(
      user.id,
      user.email,
      session.id,
    );
    const refreshToken = await this.tokenService.generateRefreshToken(
      user.id,
      user.email,
      session.id,
    );
    const refreshTokenHash =
      await this.tokenService.hashRefreshToken(refreshToken);

    // Update session with actual refresh token hash
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
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

    // Cache user profile
    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      profile: user.profile,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
    };

    await this.cacheService.cacheUserProfile(user.id, userData);

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
      this.logger.warn('Refresh token not found in cookies');
      throw new UnauthorizedException('Refresh token required');
    }

    try {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);
      if (!payload) {
        this.logger.warn('Invalid refresh token payload');
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is expired
      if (payload.expired) {
        this.logger.warn('Refresh token expired');
        throw new UnauthorizedException('Refresh token expired');
      }

      // Get session ID from payload
      const sessionId = payload.sessionId;
      let session: any = null;

      if (sessionId) {
        // Try to find the specific session by ID
        session = await this.prisma.session.findFirst({
          where: {
            id: sessionId,
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
        });
      }

      // If session not found by ID or no session ID in payload, find by userId
      if (!session) {
        this.logger.warn(
          `Session not found by ID, searching by userId: ${payload.sub}`,
        );

        // Find all active sessions for the user
        const sessions = await this.prisma.session.findMany({
          where: {
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
          orderBy: { lastUsedAt: 'desc' },
        });

        if (sessions.length === 0) {
          this.logger.warn(`No active sessions found for user: ${payload.sub}`);
          throw new UnauthorizedException('Session not found or expired');
        }

        // Try to find the matching session by hash
        let foundSession: any = null;
        for (const possibleSession of sessions) {
          const isValid = await this.tokenService.verifyRefreshTokenHash(
            refreshToken,
            possibleSession.refreshTokenHash,
          );
          if (isValid) {
            foundSession = possibleSession;
            this.logger.debug(`Found matching session: ${foundSession.id}`);
            break;
          }
        }

        if (foundSession) {
          session = foundSession;
        } else {
          // If no match, use the most recent session
          this.logger.warn(
            `No matching session found, using most recent: ${sessions[0].id}`,
          );
          session = sessions[0];
        }
      }

      if (!session) {
        this.logger.warn(`Session not found for user: ${payload.sub}`);
        throw new UnauthorizedException('Session not found or expired');
      }

      // Verify the refresh token hash
      const isValid = await this.tokenService.verifyRefreshTokenHash(
        refreshToken,
        session.refreshTokenHash,
      );

      if (!isValid) {
        this.logger.warn(`Invalid refresh token hash for user: ${payload.sub}`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens with session ID
      const newAccessToken = await this.tokenService.generateAccessToken(
        session.userId,
        session.user.email,
        session.id,
      );
      const newRefreshToken = await this.tokenService.generateRefreshToken(
        session.userId,
        session.user.email,
        session.id,
      );
      const newRefreshTokenHash =
        await this.tokenService.hashRefreshToken(newRefreshToken);

      // Update session with new refresh token hash
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: newRefreshTokenHash,
          lastUsedAt: new Date(),
        },
      });

      // Log the refresh
      await this.prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: 'TOKEN_REFRESHED',
          entity: 'Session',
          entityId: session.id,
          metadata: {
            sessionId: session.id,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Set new cookies
      this.cookieService.setAccessTokenCookie(response, newAccessToken);
      this.cookieService.setRefreshTokenCookie(response, newRefreshToken);

      this.logger.log(
        `Token refreshed for user: ${session.userId} (session: ${session.id})`,
      );

      return {
        message: 'Tokens refreshed successfully',
        accessToken: newAccessToken,
      };
    } catch (error) {
      // Clear cookies on error
      this.cookieService.clearAllCookies(response);
      this.logger.error(`Refresh failed: ${error.message}`);
      throw error;
    }
  }

  async logout(request: any, response: Response) {
    const refreshToken = this.cookieService.getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      this.cookieService.clearAllCookies(response);
      return { message: 'Logged out successfully' };
    }

    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (payload) {
      // Try to find the specific session
      let session: any = null;

      if (payload.sessionId) {
        session = await this.prisma.session.findFirst({
          where: {
            id: payload.sessionId,
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
          },
        });
      }

      // If not found, find by userId
      if (!session) {
        session = await this.prisma.session.findFirst({
          where: {
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
          },
          orderBy: { lastUsedAt: 'desc' },
        });
      }

      if (session) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            revokedAt: new Date(),
            isActive: false,
            revokedReason: 'User logout',
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

        await this.cacheService.invalidateUserCache(payload.sub);
        await this.cacheService.invalidateByTag(`user:${payload.sub}`);
        await this.cacheService.invalidateByTag('auth');
      }
    }

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
      const sessions = await this.prisma.session.updateMany({
        where: {
          userId: payload.sub,
          isActive: true,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          isActive: false,
          revokedReason: 'Logout all devices',
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

      await this.cacheService.invalidateUserCache(payload.sub);
      await this.cacheService.invalidateByTag(`user:${payload.sub}`);
      await this.cacheService.invalidateByTag('auth');
    }

    this.cookieService.clearAllCookies(response);

    this.logger.log(`User logged out from all devices`);

    return { message: 'Logged out from all devices' };
  }

  async getCurrentUser(userId: string) {
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

    const adminScopes = await this.prisma.admin.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'asc',
      },
    });

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      profile: user.profile,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
      onboardingStep: user.profile?.onboardingStep || 'PERSONAL_INFO',
      adminScopes: adminScopes.map((admin) => ({
        id: admin.id,
        adminType: admin.adminType,
        institutionId: admin.institutionId || undefined,
        facultyId: admin.facultyId || undefined,
        departmentId: admin.departmentId || undefined,
        organizationId: admin.organizationId || undefined,
        organization: admin.organization
          ? {
              id: admin.organization.id,
              name: admin.organization.name,
              slug: admin.organization.slug,
              type: admin.organization.type,
            }
          : null,
      })),
      activeOrganizationId:
        adminScopes.find((admin) => admin.organizationId)?.organizationId ||
        null,
    };

    await this.cacheService.cacheUserProfile(userId, userData);

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
        revokedReason: 'Revoked by user',
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

    await this.cacheService.delete(`user:sessions:${userId}`);
    await this.cacheService.invalidateByTag(`user:${userId}`);

    return { message: 'Session revoked successfully' };
  }

  async isAdmin(userId: string): Promise<boolean> {
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
    await this.cacheService.set(cacheKey, isAdmin, 300);

    return isAdmin;
  }

  async getAdminScopes(userId: string): Promise<any[]> {
    const cacheKey = `user:adminScopes:${userId}`;
    const cached = await this.cacheService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const admins = await this.prisma.admin.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        assignedAt: 'asc',
      },
    });

    const scopes = admins.map((admin) => ({
      adminType: admin.adminType,
      institutionId: admin.institutionId || undefined,
      facultyId: admin.facultyId || undefined,
      departmentId: admin.departmentId || undefined,
      organizationId: admin.organizationId || undefined,
    }));

    await this.cacheService.set(cacheKey, scopes, 300);
    return scopes;
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

  async getAdminScope(userId: string): Promise<any> {
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

      this.logger.log(
        `Auth cache invalidated${userId ? ` for user: ${userId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(`Failed to invalidate auth cache: ${error.message}`);
    }
  }
}
