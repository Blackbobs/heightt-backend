import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import { CookieService } from './cookie.service';

describe('CookieService dashboard isolation', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('uses distinct host-only refresh cookies for both admin dashboards', () => {
    process.env.NODE_ENV = 'production';
    const config = { get: jest.fn().mockReturnValue('2592000') };
    const service = new CookieService(config as unknown as ConfigService);
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

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
  });
});
