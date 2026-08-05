// src/v1/onboarding/onboarding.module.ts
import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { AuthModule } from '../auth/auth.module';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  providers: [OnboardingService, CacheService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}
