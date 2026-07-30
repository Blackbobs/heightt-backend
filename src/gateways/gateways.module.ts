import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [NotificationGateway, JwtService, PrismaService],
  exports: [NotificationGateway],
})
export class GatewaysModule {}
