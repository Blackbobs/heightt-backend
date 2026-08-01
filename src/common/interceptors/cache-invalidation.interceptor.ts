// src/common/interceptors/cache-invalidation.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  constructor(private readonly cacheService: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const handler = context.getHandler();
    const tags = this.getInvalidationTags(handler);

    return next.handle().pipe(
      tap(async (data) => {
        if (tags && tags.length > 0) {
          for (const tag of tags) {
            await this.cacheService.invalidateByTag(tag);
          }
          this.logger.debug(`Invalidated cache tags: ${tags.join(', ')}`);
        }
      }),
    );
  }

  private getInvalidationTags(handler: Function): string[] | null {
    return Reflect.getMetadata('cache:invalidate', handler) || null;
  }
}
