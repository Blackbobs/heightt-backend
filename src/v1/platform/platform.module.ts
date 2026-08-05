// src/v1/platform/platform.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, CacheService],
  exports: [PlatformService],
})
export class PlatformModule {}
