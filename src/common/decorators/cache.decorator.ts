// src/common/decorators/cache.decorator.ts
import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { CacheInterceptor } from '../interceptors/cache.interceptor';
import { CacheInvalidationInterceptor } from '../interceptors/cache-invalidation.interceptor';

export const CACHE_KEY = 'cache';
export const CACHE_INVALIDATE_KEY = 'cache:invalidate';

export interface CacheOptions {
  key?: string | ((context: any) => string);
  ttl?: number;
  tags?: string[];
  skipCache?: boolean | ((context: any) => boolean);
}

/**
 * Cache decorator for GET endpoints
 * @param options Cache options
 */
export function Cache(options: CacheOptions = {}) {
  return applyDecorators(
    SetMetadata(CACHE_KEY, options),
    UseInterceptors(CacheInterceptor),
  );
}

/**
 * Cache with TTL (time to live in seconds)
 */
export function Cacheable(ttl: number = 300, tags: string[] = []) {
  return Cache({ ttl, tags });
}

/**
 * Cache with custom key
 */
export function CacheKey(key: string | ((context: any) => string)) {
  return Cache({ key });
}

/**
 * Invalidate cache by tags
 */
export function InvalidateCache(tags: string[]) {
  return applyDecorators(
    SetMetadata(CACHE_INVALIDATE_KEY, tags),
    UseInterceptors(CacheInvalidationInterceptor),
  );
}

/**
 * Combined: Cache with invalidation
 * Use this when you want both caching and invalidation on the same endpoint
 * Note: Apply decorators separately: @Cache() and @InvalidateCache() separately
 * or use this helper that applies both
 */
export function CacheAndInvalidate(
  cacheOptions: CacheOptions = {},
  invalidateTags: string[] = [],
) {
  // Apply both decorators separately
  return applyDecorators(
    SetMetadata(CACHE_KEY, cacheOptions),
    SetMetadata(CACHE_INVALIDATE_KEY, invalidateTags),
    // We need to apply both interceptors
    (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      // Apply cache interceptor
      UseInterceptors(CacheInterceptor)(target, propertyKey, descriptor);
      // Apply invalidation interceptor
      if (invalidateTags.length > 0) {
        UseInterceptors(CacheInvalidationInterceptor)(
          target,
          propertyKey,
          descriptor,
        );
      }
    },
  );
}
