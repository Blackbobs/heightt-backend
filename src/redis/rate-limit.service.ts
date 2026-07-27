import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  async checkLoginAttempts(
    key: string,
    maxAttempts: number = 5,
    windowMinutes: number = 15,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const redisKey = `login:attempts:${key}`;
    const current = await this.redisService.get<number>(redisKey) || 0;

    if (current >= maxAttempts) {
      const ttl = await this.redisService.ttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + ttl * 1000,
      };
    }

    return {
      allowed: true,
      remaining: maxAttempts - current,
      resetTime: Date.now() + windowMinutes * 60 * 1000,
    };
  }

  async incrementLoginAttempt(key: string, windowMinutes: number = 15): Promise<number> {
    const redisKey = `login:attempts:${key}`;
    const count = await this.redisService.increment(redisKey);
    await this.redisService.expire(redisKey, windowMinutes * 60);
    return count;
  }

  async resetLoginAttempts(key: string): Promise<void> {
    await this.redisService.delete(`login:attempts:${key}`);
  }

  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const redisKey = `rate:${key}`;
    const current = await this.redisService.get<number>(redisKey) || 0;

    if (current >= limit) {
      const ttl = await this.redisService.ttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + ttl * 1000,
      };
    }

    return {
      allowed: true,
      remaining: limit - current,
      resetTime: Date.now() + windowSeconds * 1000,
    };
  }

  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const redisKey = `rate:${key}`;
    const count = await this.redisService.increment(redisKey);
    await this.redisService.expire(redisKey, windowSeconds);
    return count;
  }
}