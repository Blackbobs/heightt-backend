// src/common/interceptors/cache.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../redis/cache.service';

export interface CacheOptions {
  key: string | ((context: ExecutionContext) => string);
  ttl?: number;
  tags?: string[];
  skipCache?: boolean | ((context: ExecutionContext) => boolean);
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(private readonly cacheService: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Skip cache for non-GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    // Generate cache key
    const cacheKey = this.generateCacheKey(context, request);
    if (!cacheKey) {
      return next.handle();
    }

    // Check if we should skip caching
    const shouldSkip = this.shouldSkipCache(context);
    if (shouldSkip) {
      return next.handle();
    }

    // Check cache
    try {
      const cached = await this.cacheService.get(cacheKey);
      if (cached !== null) {
        this.logger.debug(`Cache HIT: ${cacheKey}`);
        response.header('X-Cache', 'HIT');
        return of(cached);
      }

      this.logger.debug(`Cache MISS: ${cacheKey}`);
      response.header('X-Cache', 'MISS');

      // Execute and cache result
      return next.handle().pipe(
        tap(async (data) => {
          // Only cache successful responses
          if (response.statusCode >= 200 && response.statusCode < 300) {
            const ttl = this.getTTL(context);
            const tags = this.getTags(context);
            
            if (tags && tags.length > 0) {
              await this.cacheService.setWithTag(cacheKey, data, tags, ttl);
            } else {
              await this.cacheService.set(cacheKey, data, ttl);
            }
            
            this.logger.debug(`Cached: ${cacheKey} (TTL: ${ttl}s, Tags: ${tags?.join(',') || 'none'})`);
          }
        }),
      );
    } catch (error) {
      this.logger.error(`Cache interceptor error: ${error.message}`);
      return next.handle();
    }
  }

  private generateCacheKey(context: ExecutionContext, request: any): string | null {
    // Get cache key from metadata
    const handler = context.getHandler();
    const cacheOptions = this.getCacheOptions(handler);

    if (cacheOptions?.key) {
      if (typeof cacheOptions.key === 'function') {
        return cacheOptions.key(context);
      }
      return cacheOptions.key;
    }

    // Generate from URL and user context
    const url = request.url;
    const userId = request.user?.id || 'anonymous';
    const queryString = JSON.stringify(request.query);
    return `${request.method}:${url}:${userId}:${queryString}`;
  }

  private shouldSkipCache(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const cacheOptions = this.getCacheOptions(handler);

    if (cacheOptions?.skipCache === true) {
      return true;
    }

    if (typeof cacheOptions?.skipCache === 'function') {
      return cacheOptions.skipCache(context);
    }

    return false;
  }

  private getTTL(context: ExecutionContext): number {
    const handler = context.getHandler();
    const cacheOptions = this.getCacheOptions(handler);
    return cacheOptions?.ttl || 300; // Default 5 minutes
  }

  private getTags(context: ExecutionContext): string[] | undefined {
    const handler = context.getHandler();
    const cacheOptions = this.getCacheOptions(handler);
    return cacheOptions?.tags;
  }

  private getCacheOptions(handler: Function): CacheOptions | null {
    return Reflect.getMetadata('cache', handler) || null;
  }
}