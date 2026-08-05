// src/v1/finance/finance.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { LedgerService } from './ledger.service';
import { ReceiptService } from './receipt.service';
import { FinanceController } from './finance.controller';
import { CacheService } from '../../redis/cache.service';

@Module({
  imports: [AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService, LedgerService, ReceiptService, CacheService],
  exports: [FinanceService, LedgerService, ReceiptService],
})
export class FinanceModule {}
