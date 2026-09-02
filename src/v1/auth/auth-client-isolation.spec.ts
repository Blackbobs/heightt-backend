import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

describe('AuthService dashboard client isolation', () => {
  it('refreshes only the requested platform session and rotates its cookie', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    const response = {} as Response;
    const session = {
      id: 'platform-session',
      userId: 'platform-user',
      authClient: 'PLATFORM_ADMIN',
      refreshTokenHash: 'hash',
      user: { email: 'platform@example.com' },
    };
    const cookieService = {
      getScopedRefreshTokenFromCookie: jest.fn().mockReturnValue('refresh'),
      setScopedRefreshTokenCookie: jest.fn(),
      clearScopedRefreshTokenCookie: jest.fn(),
    };
    const tokenService = {
      verifyRefreshToken: jest.fn().mockResolvedValue({
        sub: 'platform-user',
        sessionId: 'platform-session',
        authClient: 'PLATFORM_ADMIN',
      }),
      verifyRefreshTokenHash: jest.fn().mockResolvedValue(true),
      generateAccessToken: jest.fn().mockResolvedValue('new-access'),
      generateRefreshToken: jest.fn().mockResolvedValue('new-refresh'),
      hashRefreshToken: jest.fn().mockResolvedValue('new-hash'),
    };
    const prisma = {
      session: {
        findFirst: jest.fn().mockResolvedValue(session),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(session),
      },
    };
    Object.defineProperties(service, {
      cookieService: { value: cookieService },
      tokenService: { value: tokenService },
      prisma: { value: prisma },
      logger: { value: { warn: jest.fn() } },
    });

    await expect(
      service.refresh({}, response, 'PLATFORM_ADMIN'),
    ).resolves.toEqual({
      message: 'Tokens refreshed successfully',
      accessToken: 'new-access',
    });
    expect(JSON.stringify(prisma.session.findFirst.mock.calls)).toContain(
      '"authClient":"PLATFORM_ADMIN"',
    );
    expect(cookieService.setScopedRefreshTokenCookie).toHaveBeenCalledWith(
      response,
      'new-refresh',
      'PLATFORM_ADMIN',
    );
  });

  it('rejects logout when the bearer belongs to another dashboard', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;

    await expect(
      service.logout(
        { user: { authClient: 'ORGANIZATION_ADMIN' } },
        {} as Response,
        'PLATFORM_ADMIN',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
