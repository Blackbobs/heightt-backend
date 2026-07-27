import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { randomBytes } from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly redisService: RedisService) {}

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async storeOtp(
    key: string,
    otp: string,
    ttlSeconds: number = 600, // 10 minutes
  ): Promise<void> {
    await this.redisService.set(`otp:${key}`, otp, ttlSeconds);
    this.logger.debug(`OTP stored for ${key}`);
  }

  async verifyOtp(key: string, otp: string): Promise<boolean> {
    const storedOtp = await this.redisService.get<string>(`otp:${key}`);
    if (!storedOtp) {
      this.logger.warn(`OTP not found for ${key}`);
      return false;
    }

    const isValid = storedOtp === otp;
    if (isValid) {
      await this.redisService.delete(`otp:${key}`);
      this.logger.debug(`OTP verified for ${key}`);
    } else {
      this.logger.warn(`Invalid OTP for ${key}`);
    }
    return isValid;
  }

  async storeVerificationToken(
    key: string,
    token: string,
    ttlSeconds: number = 3600, // 1 hour
  ): Promise<void> {
    await this.redisService.set(`verify:${key}`, token, ttlSeconds);
  }

  async verifyToken(key: string, token: string): Promise<boolean> {
    const storedToken = await this.redisService.get<string>(`verify:${key}`);
    if (!storedToken || storedToken !== token) {
      return false;
    }
    await this.redisService.delete(`verify:${key}`);
    return true;
  }

  async storePasswordResetToken(
    key: string,
    token: string,
    ttlSeconds: number = 3600, // 1 hour
  ): Promise<void> {
    await this.redisService.set(`reset:${key}`, token, ttlSeconds);
  }

  async verifyPasswordResetToken(key: string, token: string): Promise<boolean> {
    const storedToken = await this.redisService.get<string>(`reset:${key}`);
    if (!storedToken || storedToken !== token) {
      return false;
    }
    await this.redisService.delete(`reset:${key}`);
    return true;
  }
}