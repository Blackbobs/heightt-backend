// src/v1/finance/finance.module.ts

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { LedgerService } from './ledger.service';
import { ReceiptService } from './receipt.service';
import { WalletService } from './wallet.service';
import { BankAccountService } from './bank-account.service';
import { WithdrawalWebhookService } from './withdrawal-webhook.service';
import { WithdrawalWebhookController } from './withdrawal-webhook.controller';
import { FinanceController } from './finance.controller';
import { CacheService } from '../../redis/cache.service';
import { BachsModule } from '../bachs/bachs.module';

@Module({
  imports: [AuthModule, BachsModule],
  controllers: [FinanceController, WithdrawalWebhookController],
  providers: [
    FinanceService,
    LedgerService,
    ReceiptService,
    WalletService,
    BankAccountService,
    WithdrawalWebhookService,
    CacheService,
  ],
  exports: [
    FinanceService,
    LedgerService,
    ReceiptService,
    WalletService,
    BankAccountService,
    WithdrawalWebhookService,
  ],
})
export class FinanceModule {}
