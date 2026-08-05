// src/v1/governance/governance.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../../events/events.module';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';
import { CacheService } from '../../redis/cache.service';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, CacheService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
