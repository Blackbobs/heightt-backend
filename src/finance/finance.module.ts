import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { ReceiptService } from './receipt.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService, ReceiptService],
  exports: [FinanceService, ReceiptService],
})
export class FinanceModule {}
