// src/v1/organizations/organizations.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, CacheService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
