// src/v1/finance/withdrawal-webhook.service.ts

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EventService, SystemEvents } from '../../events/event.service';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';

@Injectable()
export class WithdrawalWebhookService {
  private readonly logger = new Logger(WithdrawalWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly ledgerService: LedgerService,
    private readonly walletService: WalletService,
  ) {}

  async processWebhook(
    provider: string,
    payload: any,
    signature: string,
  ): Promise<any> {
    // Verify webhook signature
    const isValid = this.verifyWebhookSignature(payload, signature, provider);
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventType = payload.event || payload.type;
    this.logger.log(`Processing withdrawal webhook: ${eventType}`);

    let result;

    switch (eventType) {
      case 'withdrawal.succeeded':
      case 'transfer.succeeded':
      case 'payout.succeeded':
        result = await this.handleWithdrawalSucceeded(payload, provider);
        break;

      case 'withdrawal.failed':
      case 'transfer.failed':
      case 'payout.failed':
        result = await this.handleWithdrawalFailed(payload, provider);
        break;

      case 'withdrawal.pending':
      case 'transfer.pending':
        result = await this.handleWithdrawalPending(payload, provider);
        break;

      default:
        this.logger.log(`Unhandled withdrawal webhook event: ${eventType}`);
        await this.storeUnhandledWebhook(provider, payload, eventType);
        break;
    }

    return result;
  }

  private async handleWithdrawalSucceeded(
    payload: any,
    provider: string,
  ): Promise<any> {
    const reference = payload.reference || payload.data?.reference;
    const providerReference = payload.id || payload.data?.id;

    this.logger.log(`Withdrawal succeeded for reference: ${reference}`);

    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { reference },
      include: {
        wallet: {
          include: {
            ledgerAccount: true,
          },
        },
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(
        `Withdrawal not found for reference: ${reference}`,
      );
    }

    if (withdrawal.status === 'COMPLETED') {
      this.logger.log(`Withdrawal ${withdrawal.id} already completed`);
      return { withdrawalId: withdrawal.id, status: 'COMPLETED' };
    }

    // Update withdrawal status
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Record webhook
      await tx.withdrawalWebhook.create({
        data: {
          withdrawalId: withdrawal.id,
          event: 'withdrawal.succeeded',
          status: 'SUCCESS',
          amount: withdrawal.amount,
          reference: withdrawal.reference,
          provider: provider,
          providerReference: providerReference,
          response: payload,
          processedAt: new Date(),
        },
      });

      return updatedWithdrawal;
    });

    this.logger.log(`Withdrawal ${withdrawal.id} completed via webhook`);

    this.eventService.emit(SystemEvents.WITHDRAWAL_COMPLETED, {
      withdrawalId: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      reference: withdrawal.reference,
      bankName: withdrawal.bankName,
      completedAt: new Date(),
    });

    return {
      withdrawalId: withdrawal.id,
      status: 'COMPLETED',
    };
  }

  private async handleWithdrawalFailed(
    payload: any,
    provider: string,
  ): Promise<any> {
    const reference = payload.reference || payload.data?.reference;
    const providerReference = payload.id || payload.data?.id;
    const failureReason =
      payload.reason || payload.data?.reason || 'Unknown error';

    this.logger.warn(
      `Withdrawal failed for reference: ${reference}, reason: ${failureReason}`,
    );

    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { reference },
      include: {
        wallet: {
          include: {
            ledgerAccount: true,
          },
        },
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(
        `Withdrawal not found for reference: ${reference}`,
      );
    }

    if (withdrawal.status === 'FAILED') {
      this.logger.log(`Withdrawal ${withdrawal.id} already failed`);
      return { withdrawalId: withdrawal.id, status: 'FAILED' };
    }

    const totalAmount = withdrawal.amount + (withdrawal.fee || 0);

    // Refund the amount back to the wallet
    const updated = await this.prisma.$transaction(async (tx) => {
      // Update withdrawal
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason,
        },
      });

      // Release the hold
      await tx.walletHold.updateMany({
        where: {
          walletId: withdrawal.walletId,
          reason: { contains: `Withdrawal request #${withdrawal.id}` },
          status: 'ACTIVE',
        },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
        },
      });

      // Refund the balance
      if (withdrawal.wallet) {
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: {
            balance: withdrawal.wallet.balance + totalAmount,
            heldBalance: Math.max(
              0,
              (withdrawal.wallet.heldBalance || 0) - totalAmount,
            ),
          },
        });

        if (withdrawal.wallet.ledgerAccount) {
          await tx.ledgerAccount.update({
            where: { id: withdrawal.wallet.ledgerAccountId! },
            data: {
              balance: withdrawal.wallet.ledgerAccount.balance + totalAmount,
            },
          });
        }
      }

      // Record webhook
      await tx.withdrawalWebhook.create({
        data: {
          withdrawalId: withdrawal.id,
          event: 'withdrawal.failed',
          status: 'FAILED',
          amount: withdrawal.amount,
          reference: withdrawal.reference,
          provider: provider,
          providerReference: providerReference,
          response: payload,
          processedAt: new Date(),
        },
      });

      return updatedWithdrawal;
    });

    this.logger.log(`Withdrawal ${withdrawal.id} failed, funds refunded`);

    this.eventService.emit(SystemEvents.WITHDRAWAL_FAILED, {
      withdrawalId: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      reference: withdrawal.reference,
      reason: failureReason,
    });

    return {
      withdrawalId: withdrawal.id,
      status: 'FAILED',
      reason: failureReason,
    };
  }

  private async handleWithdrawalPending(
    payload: any,
    provider: string,
  ): Promise<any> {
    const reference = payload.reference || payload.data?.reference;
    const providerReference = payload.id || payload.data?.id;

    this.logger.log(`Withdrawal pending for reference: ${reference}`);

    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { reference },
    });

    if (!withdrawal) {
      throw new NotFoundException(
        `Withdrawal not found for reference: ${reference}`,
      );
    }

    // Update withdrawal status to processing
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'PROCESSING',
        },
      });

      await tx.withdrawalWebhook.create({
        data: {
          withdrawalId: withdrawal.id,
          event: 'withdrawal.pending',
          status: 'PENDING',
          amount: withdrawal.amount,
          reference: withdrawal.reference,
          provider: provider,
          providerReference: providerReference,
          response: payload,
        },
      });

      return updatedWithdrawal;
    });

    return {
      withdrawalId: withdrawal.id,
      status: 'PROCESSING',
    };
  }

  private async storeUnhandledWebhook(
    provider: string,
    payload: any,
    eventType: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: 'WEBHOOK_UNHANDLED',
        entity: 'WithdrawalWebhook',
        metadata: {
          provider,
          eventType,
          payload,
          receivedAt: new Date().toISOString(),
        },
      },
    });
  }

  private verifyWebhookSignature(
    payload: any,
    signature: string,
    provider: string,
  ): boolean {
    try {
      let secret: string | undefined;

      switch (provider) {
        case 'Bachs':
          secret = this.configService.get<string>('BACHS_WEBHOOK_SECRET');
          break;
        case 'Paystack':
          secret = this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET');
          break;
        default:
          secret = this.configService.get<string>('WITHDRAWAL_WEBHOOK_SECRET');
          break;
      }

      if (!secret) {
        this.logger.error(
          `Webhook secret not configured for provider: ${provider}`,
        );
        return false;
      }

      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error) {
      this.logger.error(`Webhook verification error: ${error.message}`);
      return false;
    }
  }
}
