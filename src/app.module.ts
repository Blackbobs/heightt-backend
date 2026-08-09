// src/app.module.ts
import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { EmailModule } from './email/email.module';
import { EventsModule } from './events/events.module';
import { GatewaysModule } from './gateways/gateways.module';
import { V1Module } from './v1/v1.module';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { SanitizeInterceptor } from './common/interceptors/sanitize.interceptor';
import { XssGuard } from './common/guards/xss.guard';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { CacheModule } from './redis/cache.module';
import { BachsModule } from './v1/bachs/bachs.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './v1/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development', '.env.production'],
      validationOptions: {
        allowUnknownKeys: true,
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_TTL', 60) * 1000,
            limit: config.get('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
    PrismaModule,
    RedisModule,
    CacheModule,
    EmailModule,
    EventsModule,
    BachsModule,
    GatewaysModule,
    CommonModule,
    V1Module,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: XssGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SanitizeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(30000),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
