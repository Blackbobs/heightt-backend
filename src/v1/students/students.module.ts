// src/v1/students/students.module.ts

import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PromotionService } from './promotion.service';
import { AuthModule } from '../auth/auth.module';
import { CacheService } from '../../redis/cache.service';
import { FinanceModule } from '../finance/finance.module';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [AuthModule, FinanceModule, CommunicationModule],
  controllers: [StudentsController],
  providers: [StudentsService, PromotionService, CacheService],
  exports: [StudentsService, PromotionService],
})
export class StudentsModule {}
