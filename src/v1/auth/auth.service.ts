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
import { AuthClient, TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { PermissionService } from './permission.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { createHash, randomBytes } from 'crypto';
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

  private getFrontendUrl(): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    return frontendUrl.replace(/\/+$/, '');
  }

  // ============================================
  // REGISTER - NO AUTO-LOGIN
  // ============================================

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
      const frontendUrl = this.getFrontendUrl();
      const verificationLink = `${frontendUrl}/verify-email?token=${verification.token}`;

      try {
        await this.emailService.sendVerificationEmailWithLink(
          user.email,
          user.username,
          verificationLink,
        );
        this.logger.log(`Verification email sent to: ${user.email}`);
      } catch (emailError) {
        this.logger.error(
          `Failed to send verification email: ${emailError.message}`,
        );
      }
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

  // ============================================
  // VERIFY EMAIL
  // ============================================

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

    try {
      await this.emailService.sendWelcomeEmail(
        verification.user.email,
        verification.user.username,
      );
    } catch (error) {
      this.logger.error(`Failed to send welcome email: ${error.message}`);
    }

    await this.cacheService.invalidateUserCache(verification.userId);

    this.logger.log(
      `Email verified successfully for user: ${verification.userId}`,
    );

    return {
      message: 'Email verified successfully',
      email: verification.email,
    };
  }

  // ============================================
  // RESEND VERIFICATION
  // ============================================

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

    const frontendUrl = this.getFrontendUrl();
    const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

    try {
      await this.emailService.sendVerificationEmailWithLink(
        user.email,
        user.username,
        verificationLink,
      );
      this.logger.log(`Verification email resent to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to resend verification email: ${error.message}`,
      );
      throw new BadRequestException(
        'Failed to send verification email. Please try again.',
      );
    }

    return {
      message: 'Verification email sent successfully. Please check your inbox.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, request: any) {
    const email = dto.email.trim().toLowerCase();
    const rateLimitKey = `forgot-password:${request.ip || 'unknown'}:${email}`;
    const rateLimit = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      5,
      15 * 60,
    );

    if (!rateLimit.allowed) {
      throw new BadRequestException(
        'Too many password reset requests. Please try again later.',
      );
    }
    await this.rateLimitService.incrementRateLimit(rateLimitKey, 15 * 60);

    const genericResponse = {
      message:
        'If an eligible account exists for that email address, a password reset link has been sent.',
    };
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.status !== 'ACTIVE') {
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordReset.create({
        data: { userId: user.id, token: tokenHash, expiresAt },
      });
    });

    const sent = await this.emailService.sendPasswordResetEmail(
      user.email,
      user.username,
      rawToken,
    );
    if (!sent) {
      this.logger.error(`Password reset email could not be sent to ${user.id}`);
    }

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto, request: any) {
    const tokenHash = this.hashPasswordResetToken(dto.token);
    const reset = await this.prisma.passwordReset.findFirst({
      where: {
        token: tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!reset || reset.user.status !== 'ACTIVE') {
      throw new BadRequestException('Reset link is invalid or has expired.');
    }

    const passwordHash = await PasswordUtil.hash(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Reset link is invalid or has expired.');
      }

      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.session.updateMany({
        where: { userId: reset.userId, isActive: true },
        data: {
          isActive: false,
          revokedAt: now,
          revokedReason: 'Password reset',
        },
      });
      await tx.auditLog.create({
        data: {
          userId: reset.userId,
          action: 'PASSWORD_RESET',
          entity: 'User',
          entityId: reset.userId,
          ipAddress: request.ip,
          userAgent: request.headers?.['user-agent'],
        },
      });
    });

    await this.cacheService.invalidateUserCache(reset.userId);
    await this.emailService.sendPasswordChangedEmail(
      reset.user.email,
      reset.user.username,
    );

    return {
      message:
        'Password reset successfully. Please sign in with your new password.',
    };
  }

  private hashPasswordResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ============================================
  // LOGIN - SETS HTTP-ONLY COOKIES
  // ============================================

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

    const agent = useragent.parse(request.headers['user-agent'] || '');
    const browser = agent.family;
    const os = agent.os.family;

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
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

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

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

    this.cookieService.setAccessTokenCookie(response, accessToken);
    this.cookieService.setRefreshTokenCookie(response, refreshToken);

    this.logger.log(`User logged in successfully: ${user.id}`);

    // Use the same serializer as /auth/me and admin login so regular login
    // includes resource IDs for every active admin assignment.
    await this.cacheService.invalidateUserCache(user.id);
    const currentUser = await this.getCurrentUser(user.id);
    const userData = {
      ...currentUser,
      sessionId: session.id,
      accessToken: accessToken,
    };

    return userData;
  }

  // ============================================
  // REFRESH TOKEN
  // ============================================

  async refresh(request: any, response: Response, expectedClient?: AuthClient) {
    const refreshToken = expectedClient
      ? this.cookieService.getScopedRefreshTokenFromCookie(
          request,
          expectedClient,
        )
      : this.cookieService.getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      this.logger.warn('Refresh token not found in cookies');
      throw new UnauthorizedException('Refresh token required');
    }

    try {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);
      if (!payload || payload.expired) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      const tokenClient: AuthClient = payload.authClient || 'USER';
      if (expectedClient && tokenClient !== expectedClient) {
        throw new UnauthorizedException(
          'Refresh token belongs to a different Heightt application',
        );
      }

      const clientScope = expectedClient
        ? { authClient: expectedClient }
        : { authClient: 'USER' as const };

      let session: any = null;
      if (payload.sessionId) {
        session = await this.prisma.session.findFirst({
          where: {
            id: payload.sessionId,
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            ...clientScope,
          },
          include: { user: true },
        });
      }

      if (!session) {
        const sessions = await this.prisma.session.findMany({
          where: {
            userId: payload.sub,
            isActive: true,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            ...clientScope,
          },
          include: { user: true },
          orderBy: { lastUsedAt: 'desc' },
        });

        for (const possibleSession of sessions) {
          const isValid = await this.tokenService.verifyRefreshTokenHash(
            refreshToken,
            possibleSession.refreshTokenHash,
          );
          if (isValid) {
            session = possibleSession;
            break;
          }
        }

        if (!session && sessions.length > 0) {
          session = sessions[0];
        }
      }

      if (!session) {
        throw new UnauthorizedException('Session not found');
      }

      const isValid = await this.tokenService.verifyRefreshTokenHash(
        refreshToken,
        session.refreshTokenHash,
      );

      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newAccessToken = await this.tokenService.generateAccessToken(
        session.userId,
        session.user.email,
        session.id,
        tokenClient,
      );
      const newRefreshToken = await this.tokenService.generateRefreshToken(
        session.userId,
        session.user.email,
        session.id,
        tokenClient,
      );
      const newRefreshTokenHash =
        await this.tokenService.hashRefreshToken(newRefreshToken);

      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: newRefreshTokenHash,
          lastUsedAt: new Date(),
        },
      });

      if (expectedClient) {
        this.cookieService.setScopedRefreshTokenCookie(
          response,
          newRefreshToken,
          expectedClient,
        );
      } else {
        this.cookieService.setAccessTokenCookie(response, newAccessToken);
        this.cookieService.setRefreshTokenCookie(response, newRefreshToken);
      }

      return {
        message: 'Tokens refreshed successfully',
        accessToken: newAccessToken,
      };
    } catch (error) {
      if (expectedClient) {
        this.cookieService.clearScopedRefreshTokenCookie(
          response,
          expectedClient,
        );
      } else {
        this.cookieService.clearAllCookies(response);
      }
      throw error;
    }
  }

  // ============================================
  // LOGOUT
  // ============================================

  async logout(request: any, response: Response, expectedClient?: AuthClient) {
    if (
      expectedClient &&
      request.user?.authClient &&
      request.user.authClient !== expectedClient
    ) {
      throw new UnauthorizedException(
        'Access token belongs to a different Heightt application',
      );
    }

    const refreshToken = expectedClient
      ? this.cookieService.getScopedRefreshTokenFromCookie(
          request,
          expectedClient,
        )
      : this.cookieService.getRefreshTokenFromCookie(request);
    if (refreshToken) {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);
      if (payload) {
        let session: any = null;

        if (payload.sessionId) {
          session = await this.prisma.session.findFirst({
            where: {
              id: payload.sessionId,
              userId: payload.sub,
              isActive: true,
              revokedAt: null,
              ...(expectedClient ? { authClient: expectedClient } : {}),
            },
          });
        }

        if (!session) {
          session = await this.prisma.session.findFirst({
            where: {
              userId: payload.sub,
              isActive: true,
              revokedAt: null,
              ...(expectedClient ? { authClient: expectedClient } : {}),
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

          await this.cacheService.invalidateUserCache(payload.sub);
        }
      }
    }

    if (expectedClient) {
      this.cookieService.clearScopedRefreshTokenCookie(
        response,
        expectedClient,
      );
    } else {
      this.cookieService.clearAllCookies(response);
    }

    return { message: 'Logged out successfully' };
  }

  // ============================================
  // LOGOUT ALL
  // ============================================

  async logoutAll(request: any, response: Response) {
    this.logger.log('Logout all devices called');

    const refreshToken = this.cookieService.getRefreshTokenFromCookie(request);
    if (refreshToken) {
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
    }

    this.cookieService.clearAllCookies(response);

    this.logger.log('User logged out from all devices');

    return { message: 'Logged out from all devices' };
  }

  // ============================================
  // GET CURRENT USER - FIXED WITH ADMIN SCOPES
  // ============================================

  async getCurrentUser(userId: string) {
    const cached = await this.cacheService.getUserProfile(userId);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        studentProfile: true,
        admins: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            institution: true,
            faculty: {
              include: {
                institution: true,
              },
            },
            department: {
              include: {
                faculty: {
                  include: {
                    institution: true,
                  },
                },
              },
            },
            organization: true,
            academicSession: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // CRITICAL FIX: Only include admins that are ACTIVE and properly scoped
    const activeAdmins =
      user.admins?.filter((admin) => admin.status === 'ACTIVE') || [];

    const isPlatformAdmin = activeAdmins.some(
      (admin) => admin.adminType === 'PLATFORM_ADMIN',
    );

    const adminTypes = activeAdmins.map((admin) => admin.adminType);

    // ============================================
    // BUILD ADMIN SCOPES - ONLY FROM ACTIVE ADMINS
    // EACH SCOPE IS ISOLATED TO THE SPECIFIC RESOURCE
    // ============================================

    const adminScopes = activeAdmins.map((admin) => {
      const scope: any = {
        id: admin.id,
        adminType: admin.adminType,
        status: admin.status,
        assignedAt: admin.assignedAt,
        // The scope ID identifies which specific resource this admin has access to
        scopeId: this.getScopeId(admin),
      };

      // Add scope data based on admin type - ONLY the specific resource
      const adminType = admin.adminType;

      switch (adminType) {
        case 'PLATFORM_ADMIN':
          scope.organizationId = 'platform';
          scope.organization = {
            id: 'platform',
            name: 'Platform Admin',
            slug: 'platform',
            type: 'PLATFORM',
            status: 'ACTIVE',
          };
          break;

        case 'INSTITUTION_ADMIN':
          if (admin.institution) {
            scope.institutionId = admin.institution.id;
            scope.institution = admin.institution;
            scope.organizationId = admin.institution.id;
            scope.organization = {
              id: admin.institution.id,
              name: admin.institution.name,
              slug:
                admin.institution.shortName ||
                admin.institution.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'INSTITUTION',
              status: admin.institution.status || 'ACTIVE',
            };
          }
          break;

        case 'FACULTY_ADMIN':
          if (admin.faculty) {
            scope.facultyId = admin.faculty.id;
            scope.faculty = admin.faculty;
            scope.organizationId = admin.faculty.id;
            scope.organization = {
              id: admin.faculty.id,
              name: admin.faculty.name,
              slug:
                admin.faculty.code ||
                admin.faculty.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'FACULTY',
              status: admin.faculty.status || 'ACTIVE',
            };

            // Include institution context for the faculty
            if (admin.faculty.institution) {
              scope.institutionId = admin.faculty.institution.id;
              scope.institution = admin.faculty.institution;
            }
          }
          break;

        case 'DEPARTMENT_ADMIN':
          if (admin.department) {
            scope.departmentId = admin.department.id;
            scope.department = admin.department;
            scope.organizationId = admin.department.id;
            scope.organization = {
              id: admin.department.id,
              name: admin.department.name,
              slug:
                admin.department.code ||
                admin.department.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'DEPARTMENT',
              status: admin.department.status || 'ACTIVE',
            };

            // Include faculty and institution context
            if (admin.department.faculty) {
              scope.facultyId = admin.department.faculty.id;
              scope.faculty = admin.department.faculty;
              if (admin.department.faculty.institution) {
                scope.institutionId = admin.department.faculty.institution.id;
                scope.institution = admin.department.faculty.institution;
              }
            }
          }
          break;

        case 'ORGANIZATION_ADMIN':
        case 'CLUB_ADMIN':
          if (admin.organization) {
            scope.organizationId = admin.organization.id;
            scope.organization = admin.organization;
          }
          break;

        default:
          // Fallback for unknown admin types
          const adminTypeStr = String(adminType || 'ADMIN');
          const fallbackId = admin.id || `admin-${Date.now()}`;
          scope.organizationId = fallbackId;
          scope.organization = {
            id: fallbackId,
            name: `${adminTypeStr
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (l: string) => l.toUpperCase())} Dashboard`,
            slug: adminTypeStr.toLowerCase().replace(/_/g, '-'),
            type: adminTypeStr,
            status: 'ACTIVE',
          };
      }

      // Add academic session if present
      if (admin.academicSession) {
        scope.academicSessionId = admin.academicSession.id;
        scope.academicSession = admin.academicSession;
      }

      return scope;
    });

    // Determine user type based on active admins only
    let userType = 'USER';
    if (isPlatformAdmin) {
      userType = 'PLATFORM_ADMIN';
    } else if (adminTypes.includes('INSTITUTION_ADMIN')) {
      userType = 'INSTITUTION_ADMIN';
    } else if (adminTypes.includes('ORGANIZATION_ADMIN')) {
      userType = 'ORGANIZATION_ADMIN';
    } else if (adminTypes.length > 0) {
      userType = 'ADMIN';
    }

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      status: user.status,
      profile: user.profile,
      studentProfile: user.studentProfile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      // Role information - only from active admins
      isPlatformAdmin,
      adminTypes,
      userType,
      roles: adminTypes,
      // Admin scopes - each scope is isolated
      adminScopes,
      // Indicate if this is an admin session
      isAdminSession: adminScopes.length > 0,
      // Highest permission level for UI
      highestAdminType: isPlatformAdmin
        ? 'PLATFORM_ADMIN'
        : adminTypes[0] || null,
    };

    await this.cacheService.cacheUserProfile(userId, userData);

    return userData;
  }

  /**
   * Helper to get a unique scope identifier for an admin
   */
  private getScopeId(admin: any): string {
    switch (admin.adminType) {
      case 'PLATFORM_ADMIN':
        return 'platform';
      case 'INSTITUTION_ADMIN':
        return admin.institutionId || admin.id;
      case 'FACULTY_ADMIN':
        return admin.facultyId || admin.id;
      case 'DEPARTMENT_ADMIN':
        return admin.departmentId || admin.id;
      case 'ORGANIZATION_ADMIN':
      case 'CLUB_ADMIN':
        return admin.organizationId || admin.id;
      default:
        return admin.id;
    }
  }

  // ============================================
  // GET SESSIONS
  // ============================================

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

  // ============================================
  // REVOKE SESSION
  // ============================================

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

    await this.cacheService.delete(`user:sessions:${userId}`);
    await this.cacheService.invalidateByTag(`user:${userId}`);

    return { message: 'Session revoked successfully' };
  }

  // ============================================
  // ADMIN LOGIN - SUPPORTS ALL ADMIN TYPES
  // ============================================

  async adminLogin(
    dto: LoginDto,
    request: any,
    response: Response,
    authClient: Exclude<AuthClient, 'USER'> = 'ORGANIZATION_ADMIN',
  ) {
    this.logger.log(`Admin login attempt for identifier: ${dto.identifier}`);

    // Stricter rate limiting for admin login
    const rateLimitKey = `admin-login:${authClient}:${request.ip}`;
    const attempts = await this.rateLimitService.checkLoginAttempts(
      rateLimitKey,
      3,
      30,
    );

    if (!attempts.allowed) {
      throw new UnauthorizedException(
        'Too many admin login attempts. Please try again later.',
      );
    }

    // First, authenticate the user
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

    // Get admin roles with proper relations
    const allAdminRoles = await this.prisma.admin.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        institution: true,
        faculty: {
          include: {
            institution: true,
          },
        },
        department: {
          include: {
            faculty: {
              include: {
                institution: true,
              },
            },
          },
        },
        organization: true,
        academicSession: true,
      },
    });

    const adminRoles = allAdminRoles.filter((admin) =>
      authClient === 'PLATFORM_ADMIN'
        ? admin.adminType === 'PLATFORM_ADMIN'
        : admin.adminType !== 'PLATFORM_ADMIN',
    );
    const hasAdminRole = adminRoles.length > 0;

    if (!hasAdminRole) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException(
        'Access denied. You do not have admin privileges.',
      );
    }

    // Check if user is a platform admin
    const isPlatformAdmin = adminRoles.some(
      (admin) => admin.adminType === 'PLATFORM_ADMIN',
    );

    if (authClient === 'PLATFORM_ADMIN' && !isPlatformAdmin) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException(
        'Access denied. Platform administrator privileges are required.',
      );
    }

    if (authClient === 'ORGANIZATION_ADMIN' && !hasAdminRole) {
      await this.rateLimitService.incrementLoginAttempt(rateLimitKey);
      throw new UnauthorizedException(
        'Access denied. Organization administrator privileges are required.',
      );
    }

    // Get all admin types
    const adminTypes = adminRoles.map((admin) => admin.adminType);

    // ============================================
    // BUILD ADMIN SCOPES WITH FULL DATA
    // ============================================

    const adminScopes = adminRoles.map((admin) => {
      const scope: any = {
        id: admin.id,
        adminType: admin.adminType,
        status: admin.status,
        assignedAt: admin.assignedAt,
      };

      // Add scope data based on admin type
      const adminType = admin.adminType;

      switch (adminType) {
        case 'PLATFORM_ADMIN':
          scope.organizationId = 'platform';
          scope.organization = {
            id: 'platform',
            name: 'Platform Admin',
            slug: 'platform',
            type: 'PLATFORM',
            status: 'ACTIVE',
          };
          break;

        case 'INSTITUTION_ADMIN':
          if (admin.institution) {
            scope.institutionId = admin.institution.id;
            scope.institution = admin.institution;
            scope.organizationId = admin.institution.id;
            scope.organization = {
              id: admin.institution.id,
              name: admin.institution.name,
              slug:
                admin.institution.shortName ||
                admin.institution.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'INSTITUTION',
              status: admin.institution.status || 'ACTIVE',
            };
          }
          break;

        case 'FACULTY_ADMIN':
          if (admin.faculty) {
            scope.facultyId = admin.faculty.id;
            scope.faculty = admin.faculty;
            scope.organizationId = admin.faculty.id;
            scope.organization = {
              id: admin.faculty.id,
              name: admin.faculty.name,
              slug:
                admin.faculty.code ||
                admin.faculty.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'FACULTY',
              status: admin.faculty.status || 'ACTIVE',
            };

            // Include institution context
            if (admin.faculty.institution) {
              scope.institutionId = admin.faculty.institution.id;
              scope.institution = admin.faculty.institution;
            }
          }
          break;

        case 'DEPARTMENT_ADMIN':
          if (admin.department) {
            scope.departmentId = admin.department.id;
            scope.department = admin.department;
            scope.organizationId = admin.department.id;
            scope.organization = {
              id: admin.department.id,
              name: admin.department.name,
              slug:
                admin.department.code ||
                admin.department.name.toLowerCase().replace(/\s+/g, '-'),
              type: 'DEPARTMENT',
              status: admin.department.status || 'ACTIVE',
            };

            // Include faculty and institution context
            if (admin.department.faculty) {
              scope.facultyId = admin.department.faculty.id;
              scope.faculty = admin.department.faculty;
              if (admin.department.faculty.institution) {
                scope.institutionId = admin.department.faculty.institution.id;
                scope.institution = admin.department.faculty.institution;
              }
            }
          }
          break;

        case 'ORGANIZATION_ADMIN':
        case 'CLUB_ADMIN':
          if (admin.organization) {
            scope.organizationId = admin.organization.id;
            scope.organization = admin.organization;
          }
          break;

        default:
          // Fallback for unknown admin types
          const adminTypeStr = String(adminType || 'ADMIN');
          const fallbackId = admin.id || `admin-${Date.now()}`;
          scope.organizationId = fallbackId;
          scope.organization = {
            id: fallbackId,
            name: `${adminTypeStr
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (l: string) => l.toUpperCase())} Dashboard`,
            slug: adminTypeStr.toLowerCase().replace(/_/g, '-'),
            type: adminTypeStr,
            status: 'ACTIVE',
          };
      }

      // Add academic session if present
      if (admin.academicSession) {
        scope.academicSessionId = admin.academicSession.id;
        scope.academicSession = admin.academicSession;
      }

      return scope;
    });

    await this.rateLimitService.resetLoginAttempts(rateLimitKey);

    // Generate session and tokens
    const agent = useragent.parse(request.headers['user-agent'] || '');
    const browser = agent.family;
    const os = agent.os.family;

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        browser,
        operatingSystem: os,
        ipAddress: request.ip || request.headers['x-forwarded-for'] || '',
        userAgent: request.headers['user-agent'] || '',
        deviceName: `${browser} on ${os}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(),
        isActive: true,
        authClient,
      },
    });

    const accessToken = await this.tokenService.generateAccessToken(
      user.id,
      user.email,
      session.id,
      authClient,
    );
    const refreshToken = await this.tokenService.generateRefreshToken(
      user.id,
      user.email,
      session.id,
      authClient,
    );
    const refreshTokenHash =
      await this.tokenService.hashRefreshToken(refreshToken);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log admin login with details
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ADMIN_LOGIN',
        entity: 'User',
        entityId: user.id,
        metadata: {
          email: user.email,
          username: user.username,
          adminTypes,
          isPlatformAdmin,
          authClient,
          adminScopes: adminScopes.map((s) => ({
            adminType: s.adminType,
            organizationId: s.organizationId,
            organizationName: s.organization?.name,
          })),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });

    // Admin dashboards authenticate API requests with their returned bearer
    // token. Only the dashboard-specific refresh token is stored as a cookie.
    this.cookieService.setScopedRefreshTokenCookie(
      response,
      refreshToken,
      authClient,
    );

    this.logger.log(
      `Admin logged in successfully: ${user.id} (${adminTypes.join(', ')})`,
    );

    // Determine the user type for the response
    let userType = 'ADMIN';
    if (isPlatformAdmin) {
      userType = 'PLATFORM_ADMIN';
    } else if (adminTypes.includes('INSTITUTION_ADMIN')) {
      userType = 'INSTITUTION_ADMIN';
    } else if (adminTypes.includes('ORGANIZATION_ADMIN')) {
      userType = 'ORGANIZATION_ADMIN';
    }

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      status: user.status,
      profile: user.profile,
      studentProfile: user.studentProfile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      hasCompletedOnboarding: user.profile?.onboardingCompleted || false,
      onboardingStep: user.profile?.onboardingStep || 'PERSONAL_INFO',
      sessionId: session.id,
      accessToken: accessToken,
      // Role information
      isPlatformAdmin,
      adminTypes,
      userType,
      roles: adminTypes,
      // Admin scopes with full data
      adminScopes,
      // Indicate this is an admin session
      isAdminSession: true,
      authClient,
      // Highest permission level for UI
      highestAdminType: isPlatformAdmin
        ? 'PLATFORM_ADMIN'
        : adminTypes[0] || 'ADMIN',
    };

    await this.cacheService.cacheUserProfile(user.id, userData);

    return userData;
  }

  // ============================================
  // INVALIDATE AUTH CACHE
  // ============================================

  async invalidateAuthCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        await this.cacheService.invalidateUserCache(userId);
        await this.cacheService.invalidateByTag(`user:${userId}`);
        await this.cacheService.delete(`user:sessions:${userId}`);
      }
      await this.cacheService.invalidateByTag('auth');
      await this.cacheService.invalidateByTag('users');
    } catch (error) {
      this.logger.error(`Failed to invalidate auth cache: ${error.message}`);
    }
  }
}
