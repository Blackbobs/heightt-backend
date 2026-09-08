import { getCookieSettings } from './cookie.config';

describe('cookie settings', () => {
  it.each([
    ['development', false, 'lax'],
    ['production', true, 'none'],
  ])('preserves %s defaults', (NODE_ENV, secure, sameSite) => {
    expect(getCookieSettings({ NODE_ENV })).toEqual({ secure, sameSite });
  });

  it('supports cross-site HTTPS cookies in development', () => {
    expect(
      getCookieSettings({
        NODE_ENV: 'development',
        COOKIE_SECURE: 'true',
        COOKIE_SAME_SITE: 'none',
      }),
    ).toEqual({ secure: true, sameSite: 'none' });
  });

  it.each([
    { COOKIE_SECURE: 'invalid' },
    { COOKIE_SAME_SITE: 'invalid' },
    { COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'none' },
  ])('rejects invalid browser cookie settings: %j', (env) => {
    expect(() => getCookieSettings(env)).toThrow();
  });
});
