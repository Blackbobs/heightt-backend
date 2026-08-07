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
        const nodeEnv = configService.get('NODE_ENV', 'development');

        // Check if using Upstash (production/staging)
        const upstashUrl = configService.get('UPSTASH_REDIS_REST_URL');
        const upstashToken = configService.get('UPSTASH_REDIS_REST_TOKEN');

        if (nodeEnv === 'production' && upstashUrl && upstashToken) {
          // Use Upstash Redis REST API
          const Redis = require('ioredis');
          return new Redis({
            host: upstashUrl.replace('https://', '').split(':')[0],
            port: 6379,
            password: upstashToken,
            tls: {},
            retryStrategy: (times) => {
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
            maxRetriesPerRequest: 3,
          });
        }

        // Local development
        return new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD') || undefined,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
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
