// src/common/services/rate-limit.module.ts
import { Module, Global } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RedisModule } from '../../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
