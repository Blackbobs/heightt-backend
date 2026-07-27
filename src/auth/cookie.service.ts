import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

  /**
   * Set access token cookie
   * Short-lived (15 minutes), HttpOnly, Secure
   */
  setAccessTokenCookie(response: Response, token: string): void {
    response.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
  }

  /**
   * Set refresh token cookie
   * Long-lived (30 days), HttpOnly, Secure, Strict SameSite
   */
  setRefreshTokenCookie(response: Response, token: string): void {
    response.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  /**
   * Clear access token cookie
   */
  clearAccessTokenCookie(response: Response): void {
    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  /**
   * Clear refresh token cookie
   */
  clearRefreshTokenCookie(response: Response): void {
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  /**
   * Clear all authentication cookies
   */
  clearAllCookies(response: Response): void {
    this.clearAccessTokenCookie(response);
    this.clearRefreshTokenCookie(response);
  }

  /**
   * Get refresh token from request cookies
   */
  getRefreshTokenFromCookie(request: any): string | null {
    return request?.cookies?.refreshToken || null;
  }

  /**
   * Get access token from request cookies
   */
  getAccessTokenFromCookie(request: any): string | null {
    return request?.cookies?.accessToken || null;
  }

  /**
   * Check if refresh token exists in cookies
   */
  hasRefreshToken(request: any): boolean {
    return !!this.getRefreshTokenFromCookie(request);
  }

  /**
   * Check if access token exists in cookies
   */
  hasAccessToken(request: any): boolean {
    return !!this.getAccessTokenFromCookie(request);
  }
}
