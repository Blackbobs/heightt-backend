import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BachsClient } from './bachs.client';
import { BachsWebhookController } from './bachs-webhook.controller';
import { BachsService } from './bachs.service';
import { PrismaModule } from '../../prisma/prisma.module';
// import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    PrismaModule,
    // FinanceModule,
  ],
  controllers: [BachsWebhookController],
  providers: [BachsClient, BachsService],
  exports: [BachsClient, BachsService],
})
export class BachsModule {}
