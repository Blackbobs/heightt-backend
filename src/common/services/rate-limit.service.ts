// src/common/services/rate-limit.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    return this.redisService.rateLimit(key, limit, windowSeconds);
  }

  async getRateLimitInfo(key: string): Promise<{
    count: number;
    remaining: number;
    resetAt: number;
  }> {
    const now = Date.now();
    const redisKey = `rate-limit:${key}`;
    const windowStart = now - 60 * 1000;

    // Remove old entries first
    await this.redisService.zremrangebyscore(redisKey, 0, windowStart);

    const count = await this.redisService.zcard(redisKey);

    return {
      count,
      remaining: Math.max(0, 100 - count),
      resetAt: now + 60 * 1000,
    };
  }
}
