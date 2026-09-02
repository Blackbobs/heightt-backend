import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { AuthClient } from './token.service';

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

  constructor(private readonly configService: ConfigService) {}

  private cookieOptions(maxAge?: number) {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }

  private scopedRefreshCookieName(authClient: AuthClient): string {
    const prefix = process.env.NODE_ENV === 'production' ? '__Host-' : '';
    switch (authClient) {
      case 'PLATFORM_ADMIN':
        return `${prefix}heightt.platform.refresh`;
      case 'ORGANIZATION_ADMIN':
        return `${prefix}heightt.organization.refresh`;
      default:
        return 'refreshToken';
    }
  }

  setAccessTokenCookie(response: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const expirySeconds = parseInt(
      this.configService.get('JWT_ACCESS_EXPIRY', '900'),
      10,
    );
    const maxAgeMs = expirySeconds * 1000;

    this.logger.debug(
      `Setting access token cookie with maxAge: ${maxAgeMs}ms (${expirySeconds}s)`,
    );

    response.cookie('accessToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  setRefreshTokenCookie(response: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const expirySeconds = parseInt(
      this.configService.get('JWT_REFRESH_EXPIRY', '2592000'),
      10,
    );
    const maxAgeMs = expirySeconds * 1000;

    this.logger.debug(
      `Setting refresh token cookie with maxAge: ${maxAgeMs}ms (${expirySeconds}s)`,
    );

    response.cookie('refreshToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  setScopedRefreshTokenCookie(
    response: Response,
    token: string,
    authClient: AuthClient,
  ): void {
    const expirySeconds = parseInt(
      this.configService.get('JWT_REFRESH_EXPIRY', '2592000'),
      10,
    );
    response.cookie(
      this.scopedRefreshCookieName(authClient),
      token,
      this.cookieOptions(expirySeconds * 1000),
    );
  }

  clearAccessTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
  }

  clearRefreshTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
  }

  clearScopedRefreshTokenCookie(
    response: Response,
    authClient: AuthClient,
  ): void {
    response.clearCookie(
      this.scopedRefreshCookieName(authClient),
      this.cookieOptions(),
    );
  }

  clearAllCookies(response: Response): void {
    this.clearAccessTokenCookie(response);
    this.clearRefreshTokenCookie(response);
  }

  getRefreshTokenFromCookie(request: any): string | null {
    return request?.cookies?.refreshToken || null;
  }

  getScopedRefreshTokenFromCookie(
    request: any,
    authClient: AuthClient,
  ): string | null {
    return request?.cookies?.[this.scopedRefreshCookieName(authClient)] || null;
  }

  getAccessTokenFromCookie(request: any): string | null {
    return request?.cookies?.accessToken || null;
  }

  hasRefreshToken(request: any): boolean {
    return !!this.getRefreshTokenFromCookie(request);
  }

  hasAccessToken(request: any): boolean {
    return !!this.getAccessTokenFromCookie(request);
  }
}
