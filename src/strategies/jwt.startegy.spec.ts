import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { extractAccessToken, JwtStrategy } from './jwt.startegy';

describe('JWT access-token extraction', () => {
  it('prioritizes a dashboard bearer token over a shared access cookie', () => {
    const request = {
      headers: { authorization: 'Bearer platform-token' },
      cookies: { accessToken: 'organization-cookie-token' },
    } as unknown as Request;

    expect(extractAccessToken(request)).toBe('platform-token');
  });

  it('falls back to cookie authentication when no bearer token exists', () => {
    const request = {
      headers: {},
      cookies: { accessToken: 'web-cookie-token' },
    } as unknown as Request;

    expect(extractAccessToken(request)).toBe('web-cookie-token');
  });
});

describe('JWT verified-user enforcement', () => {
  const configService = {
    get: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;

  function createStrategy(emailVerified: boolean) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'student@example.com',
          emailVerified,
          username: 'student',
          status: 'ACTIVE',
        }),
      },
    } as unknown as PrismaService;

    return new JwtStrategy(configService, prisma);
  }

  it('rejects an unverified regular user from protected endpoints', async () => {
    const strategy = createStrategy(false);

    await expect(
      strategy.validate({} as Request, {
        sub: 'user-1',
        type: 'access',
        authClient: 'USER',
      }),
    ).rejects.toThrow(new UnauthorizedException('Email verification required'));
  });

  it('allows a verified regular user', async () => {
    const strategy = createStrategy(true);

    await expect(
      strategy.validate({} as Request, {
        sub: 'user-1',
        type: 'access',
        authClient: 'USER',
      }),
    ).resolves.toMatchObject({ id: 'user-1', authClient: 'USER' });
  });

  it('does not change isolated admin authentication behavior', async () => {
    const strategy = createStrategy(false);

    await expect(
      strategy.validate({} as Request, {
        sub: 'user-1',
        type: 'access',
        authClient: 'ORGANIZATION_ADMIN',
      }),
    ).resolves.toMatchObject({
      id: 'user-1',
      authClient: 'ORGANIZATION_ADMIN',
    });
  });
});
