import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import { CookieService } from './cookie.service';

describe('CookieService dashboard isolation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAME_SITE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['production', 'development'])(
    'uses distinct host-only refresh cookies for both admin dashboards in %s',
    (environment) => {
      process.env.NODE_ENV = environment;
      process.env.COOKIE_SECURE = 'true';
      process.env.COOKIE_SAME_SITE = 'none';
      const config = { get: jest.fn().mockReturnValue('2592000') };
      const service = new CookieService(config as unknown as ConfigService);
      const cookie = jest.fn();
      const clearCookie = jest.fn();
      const response = { cookie, clearCookie } as unknown as Response;

      service.setScopedRefreshTokenCookie(
        response,
        'organization-refresh',
        'ORGANIZATION_ADMIN',
      );
      service.setScopedRefreshTokenCookie(
        response,
        'platform-refresh',
        'PLATFORM_ADMIN',
      );

      service.clearScopedRefreshTokenCookie(response, 'ORGANIZATION_ADMIN');
      expect(clearCookie).toHaveBeenCalledWith(
        '__Host-heightt.organization.refresh',
        expect.objectContaining({ secure: true, sameSite: 'none', path: '/' }),
      );
      expect(
        service.getScopedRefreshTokenFromCookie(
          {
            cookies: { '__Host-heightt.organization.refresh': 'token' },
          },
          'ORGANIZATION_ADMIN',
        ),
      ).toBe('token');
      service.setAccessTokenCookie(response, 'access');
      service.setRefreshTokenCookie(response, 'refresh');
      for (const name of ['accessToken', 'refreshToken']) {
        expect(cookie).toHaveBeenCalledWith(
          name,
          expect.any(String),
          expect.objectContaining({ secure: true, sameSite: 'none' }),
        );
      }

      expect(cookie).toHaveBeenNthCalledWith(
        1,
        '__Host-heightt.organization.refresh',
        'organization-refresh',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
        }),
      );
      expect(cookie).toHaveBeenNthCalledWith(
        2,
        '__Host-heightt.platform.refresh',
        'platform-refresh',
        expect.any(Object),
      );
    },
  );
});
