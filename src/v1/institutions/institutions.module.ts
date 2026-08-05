// src/v1/institutions/institutions.module.ts
import { Module } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { InstitutionsController } from './institutions.controller';
import { AuthModule } from '../auth/auth.module';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService, CacheService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
