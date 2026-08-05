// src/gateways/gateways.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';
// import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: parseInt(
            configService.get('JWT_ACCESS_EXPIRY', '900'),
            10,
          ),
        },
      }),
    }),
  ],
  providers: [NotificationGateway, CacheService],
  exports: [NotificationGateway],
})
export class GatewaysModule {}
