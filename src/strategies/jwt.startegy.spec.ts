import type { Request } from 'express';
import { extractAccessToken } from './jwt.startegy';

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
