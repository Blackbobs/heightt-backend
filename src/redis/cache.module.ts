// src/redis/cache.module.ts
import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheManagerService } from './cache-manager.service';
import { RedisModule } from './redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService, CacheManagerService],
  exports: [CacheService, CacheManagerService],
})
export class CacheModule {}
