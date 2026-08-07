// src/redis/idempotency.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';
import { ConflictException } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly DEFAULT_TTL = 86400; // 24 hours in seconds
  private readonly LOCK_TTL = 30; // 30 seconds lock timeout

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Check if a request with this idempotency key has already been processed
   */
  async getCachedResponse<T = any>(
    key: string,
    userId: string,
  ): Promise<T | null> {
    if (!key) return null;
    const cacheKey = this.getCacheKey(key, userId);
    const cached = await this.cacheService.get<T>(cacheKey);
    return cached || null;
  }

  /**
   * Store the response for an idempotent request
   */
  async storeResponse<T = any>(
    key: string,
    userId: string,
    response: T,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    if (!key) return;
    const cacheKey = this.getCacheKey(key, userId);
    await this.cacheService.set(cacheKey, response, ttl);
    this.logger.debug(`Stored idempotency response for key: ${key}`);
  }

  /**
   * Lock a key to prevent concurrent requests
   */
  async acquireLock(key: string, userId: string): Promise<boolean> {
    if (!key) return true;
    const lockKey = `idempotency:lock:${this.getCacheKey(key, userId)}`;
    const client = this.cacheService['redisService'].getClient();
    const result = await client.set(
      lockKey,
      'locked',
      'EX',
      this.LOCK_TTL,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * Release a lock
   */
  async releaseLock(key: string, userId: string): Promise<void> {
    if (!key) return;
    const lockKey = `idempotency:lock:${this.getCacheKey(key, userId)}`;
    await this.cacheService.delete(lockKey);
  }

  /**
   * Generate a unique idempotency key for a request
   */
  generateKey(): string {
    return `idem_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get cache key for idempotency
   */
  private getCacheKey(key: string, userId: string): string {
    return `idempotency:${userId}:${key}`;
  }

  /**
   * Process a request with idempotency
   */
  async processWithIdempotency<T>(
    key: string | undefined,
    userId: string,
    processor: () => Promise<T>,
  ): Promise<T> {
    // If no key, process directly
    if (!key) {
      return processor();
    }

    // Check if already processed
    const cached = await this.getCachedResponse<T>(key, userId);
    if (cached) {
      this.logger.debug(`Idempotent request detected for key: ${key}`);
      return cached;
    }

    // Try to acquire lock
    const locked = await this.acquireLock(key, userId);
    if (!locked) {
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryResult = await this.getCachedResponse<T>(key, userId);
      if (retryResult) {
        return retryResult;
      }
      throw new ConflictException(
        'Request is being processed, please try again',
      );
    }

    try {
      // Process the request
      const result = await processor();

      // Store the result
      await this.storeResponse(key, userId, result);

      return result;
    } finally {
      // Release the lock
      await this.releaseLock(key, userId);
    }
  }
}
