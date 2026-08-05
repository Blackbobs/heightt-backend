// src/v1/rbac/rbac.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, CacheService],
  exports: [RbacService],
})
export class RbacModule {}
