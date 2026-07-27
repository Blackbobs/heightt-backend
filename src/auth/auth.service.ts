import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { PasswordUtil } from '../common/utils/password.util';
import { RateLimitService } from '../redis/rate-limit.service';
import { OtpService } from '../redis/otp.service';
import { CacheService } from '../redis/cache.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto } from './dto';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as useragent from 'useragent';

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
      include: { profile: true },
    });

    if (!user || !user.isActive || user.isDeleted) {
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

    // Cache user profile
    await this.cacheService.cacheUserProfile(user.id, {
      id: user.id,
      email: user.email,
      username: user.username,
      profile: user.profile,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
    });

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

        // Invalidate cache
        await this.cacheService.invalidateUserCache(payload.sub);
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

      // Invalidate cache
      await this.cacheService.invalidateUserCache(payload.sub);
    }

    // Clear cookies
    this.cookieService.clearAllCookies(response);

    this.logger.log(`User logged out from all devices`);

    return { message: 'Logged out from all devices' };
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

    // Cache for 5 minutes
    await this.cacheService.cacheUserProfile(userId, userData);

    return userData;
  }

  async getSessions(userId: string) {
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

    return { message: 'Session revoked successfully' };
  }
}
