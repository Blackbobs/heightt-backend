import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) {}

  async get<T = any>(key: string): Promise<T | null> {
    const cached = await this.redisService.get<T>(key);
    if (cached) {
      this.logger.debug(`Cache hit for ${key}`);
    } else {
      this.logger.debug(`Cache miss for ${key}`);
    }
    return cached;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    await this.redisService.set(key, value, ttlSeconds);
    this.logger.debug(`Cache set for ${key}`);
  }

  async delete(key: string): Promise<void> {
    await this.redisService.delete(key);
    this.logger.debug(`Cache deleted for ${key}`);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      this.logger.debug(`Invalidated ${keys.length} cache keys matching ${pattern}`);
    }
  }

  async remember<T>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await callback();
    await this.set(key, data, ttlSeconds);
    return data;
  }

  // Cache user profile
  async cacheUserProfile(userId: string, profile: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(`user:profile:${userId}`, profile, ttlSeconds);
  }

  async getUserProfile(userId: string): Promise<any | null> {
    return await this.get(`user:profile:${userId}`);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.delete(`user:profile:${userId}`);
  }
}