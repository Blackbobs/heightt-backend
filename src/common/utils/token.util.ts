import { randomBytes } from 'crypto';

export class TokenUtil {
  static generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  static generateOTP(length: number = 6): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static generateExpiry(minutes: number): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
  }
}
