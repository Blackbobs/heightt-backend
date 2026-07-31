// src/redis/redis.service.ts
import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }

  getClient(): Redis {
    return this.redis;
  }

  // ============================================
  // Basic String Operations
  // ============================================

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await this.redis.set(key, stringValue, 'EX', ttl);
    } else {
      await this.redis.set(key, stringValue);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  async increment(key: string): Promise<number> {
    return await this.redis.incr(key);
  }

  async decrement(key: string): Promise<number> {
    return await this.redis.decr(key);
  }

  // ============================================
  // Hash Operations
  // ============================================

  async hset(key: string, field: string, value: any): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    await this.redis.hset(key, field, stringValue);
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    const value = await this.redis.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redis.hdel(key, field);
  }

  async hgetall<T = any>(key: string): Promise<Record<string, T>> {
    const result = await this.redis.hgetall(key);
    const parsed: Record<string, T> = {};
    for (const [field, value] of Object.entries(result)) {
      try {
        parsed[field] = JSON.parse(value) as T;
      } catch {
        parsed[field] = value as T;
      }
    }
    return parsed;
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return await this.redis.hincrby(key, field, increment);
  }

  // ============================================
  // Sorted Set Operations (for Rate Limiting)
  // ============================================

  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.redis.zadd(key, score, member);
  }

  async zcard(key: string): Promise<number> {
    return await this.redis.zcard(key);
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return await this.redis.zremrangebyscore(key, min, max);
  }

  async zcount(key: string, min: number, max: number): Promise<number> {
    return await this.redis.zcount(key, min, max);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.zrevrange(key, start, stop);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return await this.redis.zscore(key, member);
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return await this.redis.zrem(key, ...members);
  }

  // ============================================
  // List Operations
  // ============================================

  async lpush(key: string, ...values: string[]): Promise<number> {
    return await this.redis.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return await this.redis.rpush(key, ...values);
  }

  async lpop(key: string): Promise<string | null> {
    return await this.redis.lpop(key);
  }

  async rpop(key: string): Promise<string | null> {
    return await this.redis.rpop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.lrange(key, start, stop);
  }

  async llen(key: string): Promise<number> {
    return await this.redis.llen(key);
  }

  // ============================================
  // Set Operations
  // ============================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redis.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redis.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.redis.sismember(key, member);
    return result === 1;
  }

  async scard(key: string): Promise<number> {
    return await this.redis.scard(key);
  }

  // ============================================
  // Utility Operations
  // ============================================

  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async flushall(): Promise<void> {
    await this.redis.flushall();
  }

  async ping(): Promise<string> {
    return await this.redis.ping();
  }

  async multi(): Promise<any> {
    return this.redis.multi();
  }

  // ============================================
  // Cache Management Helpers
  // ============================================

  async cacheGet<T = any>(key: string): Promise<T | null> {
    return this.get<T>(key);
  }

  async cacheSet(key: string, value: any, ttl?: number): Promise<void> {
    await this.set(key, value, ttl);
  }

  async cacheDelete(key: string): Promise<void> {
    await this.delete(key);
  }

  async cacheDeletePattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // ============================================
  // Rate Limiting Helper
  // ============================================

  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `rate-limit:${key}`;

    // Remove old entries
    await this.zremrangebyscore(redisKey, 0, windowStart);

    // Count requests in current window
    const count = await this.zcard(redisKey);

    // Add current request
    await this.zadd(redisKey, now, `${now}-${Math.random()}`);

    // Set expiry on the key (window + 10 seconds buffer)
    await this.expire(redisKey, windowSeconds + 10);

    const remaining = Math.max(0, limit - count - 1);
    const resetAt = now + windowSeconds * 1000;

    return {
      allowed: count < limit,
      remaining,
      resetAt,
    };
  }

  // ============================================
  // Session Management Helpers
  // ============================================

  async setSession(
    userId: string,
    sessionData: any,
    ttl?: number,
  ): Promise<void> {
    const key = `session:${userId}`;
    await this.set(key, sessionData, ttl || 86400); // Default 24 hours
  }

  async getSession<T = any>(userId: string): Promise<T | null> {
    const key = `session:${userId}`;
    return this.get<T>(key);
  }

  async deleteSession(userId: string): Promise<void> {
    const key = `session:${userId}`;
    await this.delete(key);
  }

  // ============================================
  // Lock Helpers (for distributed locking)
  // ============================================

  async acquireLock(
    key: string,
    ttl: number = 10000, // 10 seconds default
  ): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const result = await this.redis.set(lockKey, 'locked', 'PX', ttl, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.delete(lockKey);
  }

  // ============================================
  // Queue Helpers
  // ============================================

  async enqueue(queueName: string, data: any): Promise<void> {
    const queueKey = `queue:${queueName}`;
    const value = typeof data === 'string' ? data : JSON.stringify(data);
    await this.rpush(queueKey, value);
  }

  async dequeue<T = any>(queueName: string): Promise<T | null> {
    const queueKey = `queue:${queueName}`;
    const value = await this.lpop(queueKey);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async getQueueLength(queueName: string): Promise<number> {
    const queueKey = `queue:${queueName}`;
    return this.llen(queueKey);
  }
}
