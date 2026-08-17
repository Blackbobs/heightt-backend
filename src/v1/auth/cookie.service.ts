import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

  constructor(private readonly configService: ConfigService) {}

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
      sameSite: isProduction ? 'strict' : 'lax',
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
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  clearAccessTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
  }

  clearRefreshTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
  }

  clearAllCookies(response: Response): void {
    this.clearAccessTokenCookie(response);
    this.clearRefreshTokenCookie(response);
  }

  getRefreshTokenFromCookie(request: any): string | null {
    return request?.cookies?.refreshToken || null;
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
