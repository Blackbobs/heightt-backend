// src/redis/cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  useCompression?: boolean;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTTL = 300; // 5 minutes
  private readonly keyPrefix = 'heightt:cache:';

  constructor(private readonly redisService: RedisService) {}

  // ============================================
  // Existing Methods (Keep these)
  // ============================================

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
    await this.redisService.set(key, value, ttlSeconds || this.defaultTTL);
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
      this.logger.debug(
        `Invalidated ${keys.length} cache keys matching ${pattern}`,
      );
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

  // ============================================
  // User Cache Methods (Keep these)
  // ============================================

  async cacheUserProfile(
    userId: string,
    profile: any,
    ttlSeconds: number = 300,
  ): Promise<void> {
    await this.set(`user:profile:${userId}`, profile, ttlSeconds);
  }

  async getUserProfile(userId: string): Promise<any | null> {
    return await this.get(`user:profile:${userId}`);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.delete(`user:profile:${userId}`);
  }

  // ============================================
  // NEW: Enhanced Methods
  // ============================================

  // New: Get with full key (handles prefix)
  async getWithPrefix<T = any>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    return this.get<T>(fullKey);
  }

  // New: Set with full key
  async setWithPrefix<T = any>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    const fullKey = this.getFullKey(key);
    await this.set(fullKey, value, ttlSeconds);
  }

  // New: Get or set with cache options
  async getOrSet<T = any>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFn();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds || this.defaultTTL);
    }
    return fresh;
  }

  // New: Bulk get
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await Promise.all(
        keys.map(async (key) => {
          const data = await this.get<T>(key);
          return data;
        }),
      );
      return values;
    } catch (error) {
      this.logger.error(`Cache mget error: ${error.message}`);
      return keys.map(() => null);
    }
  }

  // New: Bulk set
  async mset<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    try {
      await Promise.all(
        entries.map(({ key, value, ttl }) => this.set(key, value, ttl)),
      );
    } catch (error) {
      this.logger.error(`Cache mset error: ${error.message}`);
    }
  }

  // New: Tag-based caching
  async setWithTag<T = any>(
    key: string,
    value: T,
    tags: string[],
    ttlSeconds?: number,
  ): Promise<void> {
    // Set the main value
    await this.set(key, value, ttlSeconds);

    // Store tags for this key
    const tagKey = this.getTagKey(key);
    const client = this.redisService.getClient();
    await client.sadd(tagKey, ...tags);

    // For each tag, store the key reference
    for (const tag of tags) {
      const tagSetKey = this.getTagSetKey(tag);
      await client.sadd(tagSetKey, key);
    }
  }

  // New: Invalidate by tag
  async invalidateByTag(tag: string): Promise<void> {
    try {
      const client = this.redisService.getClient();
      const tagSetKey = this.getTagSetKey(tag);
      const keys = await client.smembers(tagSetKey);

      // Delete all keys associated with this tag
      if (keys.length > 0) {
        await client.del(...keys);
        // Clean up tag references
        for (const key of keys) {
          const tagKey = this.getTagKey(key);
          await client.del(tagKey);
        }
      }

      // Delete the tag set
      await client.del(tagSetKey);
      this.logger.debug(
        `Invalidated ${keys.length} cache keys with tag: ${tag}`,
      );
    } catch (error) {
      this.logger.error(
        `Invalidate by tag error for tag ${tag}: ${error.message}`,
      );
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      await this.invalidatePattern(pattern);
      this.logger.debug(`Deleted cache keys matching pattern: ${pattern}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete pattern ${pattern}: ${error.message}`,
      );
    }
  }

  // New: Check if key exists
  async exists(key: string): Promise<boolean> {
    return this.redisService.exists(key);
  }

  // New: Get TTL for a key
  async getTTL(key: string): Promise<number> {
    return this.redisService.ttl(key);
  }

  // New: Clear all cache
  async clearAll(): Promise<void> {
    await this.invalidatePattern('*');
    this.logger.log('All cache cleared');
  }

  // ============================================
  // Domain-Specific Cache Methods
  // ============================================

  // Organization cache
  async cacheOrganization(
    organizationId: string,
    data: any,
    ttlSeconds: number = 600,
  ): Promise<void> {
    await this.set(`organization:${organizationId}`, data, ttlSeconds);
  }

  async getOrganization(organizationId: string): Promise<any | null> {
    return await this.get(`organization:${organizationId}`);
  }

  async invalidateOrganizationCache(organizationId: string): Promise<void> {
    await this.delete(`organization:${organizationId}`);
  }

  // Wallet cache
  async cacheWallet(
    userId: string,
    data: any,
    ttlSeconds: number = 60,
  ): Promise<void> {
    await this.set(`wallet:user:${userId}`, data, ttlSeconds);
  }

  async getWallet(userId: string): Promise<any | null> {
    return await this.get(`wallet:user:${userId}`);
  }

  async invalidateWalletCache(userId: string): Promise<void> {
    await this.delete(`wallet:user:${userId}`);
  }

  // Transaction cache
  async cacheTransaction(
    transactionId: string,
    data: any,
    ttlSeconds: number = 3600,
  ): Promise<void> {
    await this.set(`transaction:${transactionId}`, data, ttlSeconds);
  }

  async getTransaction(transactionId: string): Promise<any | null> {
    return await this.get(`transaction:${transactionId}`);
  }

  async invalidateTransactionCache(transactionId: string): Promise<void> {
    await this.delete(`transaction:${transactionId}`);
  }

  // ============================================
  // Utility Methods
  // ============================================

  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private getTagKey(key: string): string {
    return `${this.keyPrefix}tag:${key}`;
  }

  private getTagSetKey(tag: string): string {
    return `${this.keyPrefix}tagset:${tag}`;
  }

  // New: Get cache stats
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
  }> {
    const client = this.redisService.getClient();
    const keys = await client.keys(`${this.keyPrefix}*`);
    const info = await client.info('memory');
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';

    return {
      totalKeys: keys.length,
      memoryUsage,
    };
  }

  // New: Warmup cache with multiple entries
  async warmup(
    entries: Array<{ key: string; value: any; ttl?: number }>,
  ): Promise<void> {
    this.logger.log(`Warming up cache with ${entries.length} entries`);
    await this.mset(entries);
  }
}
