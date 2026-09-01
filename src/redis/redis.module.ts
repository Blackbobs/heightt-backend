import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';
import { OtpService } from './otp.service';
import { CacheService } from './cache.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const upstashUrl = configService.get<string>(
          'UPSTASH_REDIS_REST_URL',
        );
        const upstashToken = configService.get<string>(
          'UPSTASH_REDIS_REST_TOKEN',
        );

        if (!upstashUrl || !upstashToken) {
          throw new Error(
            'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required',
          );
        }

        const { hostname } = new URL(upstashUrl);

        return new Redis({
          host: hostname,
          port: 6379,
          password: upstashToken,
          tls: {},
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
    RedisService,
    RateLimitService,
    IdempotencyService,
    OtpService,
    CacheService,
  ],
  exports: [
    RedisService,
    RateLimitService,
    IdempotencyService,
    OtpService,
    CacheService,
  ],
})
export class RedisModule {}
