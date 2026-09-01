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
import { BachsClient } from '../bachs/bachs.client';
import { CacheService } from '../../redis/cache.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class WithdrawalWebhookService {
  private readonly logger = new Logger(WithdrawalWebhookService.name);
  private reconciliationRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly ledgerService: LedgerService,
    private readonly walletService: WalletService,
    private readonly bachsClient: BachsClient,
    private readonly cacheService: CacheService,
  ) {}

  @Cron('*/10 * * * *')
  async reconcileStaleProcessingWithdrawals(): Promise<void> {
    if (this.reconciliationRunning) return;
    this.reconciliationRunning = true;

    try {
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const withdrawals = await this.prisma.withdrawal.findMany({
        where: {
          status: 'PROCESSING',
          providerPayoutId: { not: null },
          processedAt: { lte: staleBefore },
        },
        select: {
          id: true,
          reference: true,
          providerPayoutId: true,
        },
        orderBy: { processedAt: 'asc' },
        take: 100,
      });

      for (const withdrawal of withdrawals) {
        try {
          const payout = await this.bachsClient.getPayout(
            withdrawal.providerPayoutId!,
          );
          const status = String(payout.status || '').toUpperCase();
          const payload = {
            id: `reconciliation:${withdrawal.providerPayoutId}`,
            type: `payout.${status.toLowerCase()}`,
            reference: payout.reference || withdrawal.reference,
            data: {
              ...payout,
              payout_id: payout.id || withdrawal.providerPayoutId,
              reference: payout.reference || withdrawal.reference,
            },
          };

          if (['PAID', 'SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(status)) {
            await this.handleWithdrawalSucceeded(payload, 'Bachs');
          } else if (
            ['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(status)
          ) {
            await this.handleWithdrawalFailed(payload, 'Bachs');
          }
        } catch (error) {
          this.logger.error(
            `Could not reconcile withdrawal ${withdrawal.id}: ${error.message}`,
          );
        }
      }
    } finally {
      this.reconciliationRunning = false;
    }
  }

  async processWebhook(
    provider: string,
    payload: any,
    signature: string,
    timestamp?: string,
    rawBody?: Buffer,
  ): Promise<any> {
    // Verify webhook signature
    const isValid = this.verifyWebhookSignature(
      payload,
      signature,
      provider,
      timestamp,
      rawBody,
    );
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
      case 'payout.paid':
      case 'payout.completed':
      case 'payout.successful':
        result = await this.handleWithdrawalSucceeded(payload, provider);
        break;

      case 'withdrawal.failed':
      case 'transfer.failed':
      case 'payout.failed':
        result = await this.handleWithdrawalFailed(payload, provider);
        break;

      case 'withdrawal.pending':
      case 'transfer.pending':
      case 'payout.created':
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
    const { reference, providerReference, withdrawalId } =
      this.getWebhookIdentifiers(payload);

    this.logger.log(`Withdrawal succeeded for reference: ${reference}`);

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: {
        OR: [
          ...(withdrawalId ? [{ id: withdrawalId }] : []),
          ...(reference ? [{ reference }] : []),
          ...(providerReference
            ? [{ providerPayoutId: providerReference }]
            : []),
        ],
      },
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
    if (withdrawal.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Cannot complete withdrawal from ${withdrawal.status} status`,
      );
    }

    // Update withdrawal status
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          webhookStatus: 'COMPLETED',
          webhookCompletedAt: new Date(),
          webhookId: payload.id || undefined,
          webhookResponse: payload,
        },
      });

      // Record webhook
      await tx.withdrawalWebhook.upsert({
        where: { withdrawalId: withdrawal.id },
        create: {
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
        update: {
          event: 'payout.paid',
          status: 'SUCCESS',
          providerReference,
          response: payload,
          processedAt: new Date(),
        },
      });

      return updatedWithdrawal;
    });

    this.logger.log(`Withdrawal ${withdrawal.id} completed via webhook`);
    await this.invalidateWithdrawalWallet(withdrawal.wallet);

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
    const { reference, providerReference, withdrawalId } =
      this.getWebhookIdentifiers(payload);
    const failureReason =
      payload.reason || payload.data?.reason || 'Unknown error';

    this.logger.warn(
      `Withdrawal failed for reference: ${reference}, reason: ${failureReason}`,
    );

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: {
        OR: [
          ...(withdrawalId ? [{ id: withdrawalId }] : []),
          ...(reference ? [{ reference }] : []),
          ...(providerReference
            ? [{ providerPayoutId: providerReference }]
            : []),
        ],
      },
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
    const wasDebited = withdrawal.status === 'PROCESSING';

    // Refund the amount back to the wallet
    const updated = await this.prisma.$transaction(async (tx) => {
      // Update withdrawal
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason,
          webhookStatus: 'FAILED',
          webhookCompletedAt: new Date(),
          webhookId: payload.id || undefined,
          webhookResponse: payload,
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
            ...(wasDebited ? { balance: { increment: totalAmount } } : {}),
            heldBalance: Math.max(
              0,
              (withdrawal.wallet.heldBalance || 0) - totalAmount,
            ),
          },
        });

        if (wasDebited && withdrawal.wallet.ledgerAccount) {
          await tx.ledgerAccount.update({
            where: { id: withdrawal.wallet.ledgerAccountId! },
            data: {
              balance: { increment: totalAmount },
            },
          });
        }
        if (wasDebited) {
          const bankClearingAccount = await tx.ledgerAccount.findUnique({
            where: { code: '1100' },
            select: { id: true },
          });
          if (bankClearingAccount) {
            await tx.ledgerAccount.update({
              where: { id: bankClearingAccount.id },
              data: { balance: { decrement: totalAmount } },
            });
          }
        }
      }

      if (withdrawal.journalEntryId) {
        await tx.journalEntry.update({
          where: { id: withdrawal.journalEntryId },
          data: { status: 'REVERSED' },
        });
      }

      // Record webhook
      await tx.withdrawalWebhook.upsert({
        where: { withdrawalId: withdrawal.id },
        create: {
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
        update: {
          event: 'payout.failed',
          status: 'FAILED',
          providerReference,
          response: payload,
          processedAt: new Date(),
        },
      });

      return updatedWithdrawal;
    });

    this.logger.log(`Withdrawal ${withdrawal.id} failed, funds refunded`);
    await this.invalidateWithdrawalWallet(withdrawal.wallet);

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
    const { reference, providerReference, withdrawalId } =
      this.getWebhookIdentifiers(payload);

    this.logger.log(`Withdrawal pending for reference: ${reference}`);

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: {
        OR: [
          ...(withdrawalId ? [{ id: withdrawalId }] : []),
          ...(reference ? [{ reference }] : []),
          ...(providerReference
            ? [{ providerPayoutId: providerReference }]
            : []),
        ],
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(
        `Withdrawal not found for reference: ${reference}`,
      );
    }
    if (withdrawal.status === 'COMPLETED' || withdrawal.status === 'FAILED') {
      return { withdrawalId: withdrawal.id, status: withdrawal.status };
    }

    // Update withdrawal status to processing
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'PROCESSING',
        },
      });

      await tx.withdrawalWebhook.upsert({
        where: { withdrawalId: withdrawal.id },
        create: {
          withdrawalId: withdrawal.id,
          event: 'withdrawal.pending',
          status: 'PENDING',
          amount: withdrawal.amount,
          reference: withdrawal.reference,
          provider: provider,
          providerReference: providerReference,
          response: payload,
        },
        update: {
          event: 'payout.created',
          status: 'PENDING',
          providerReference,
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

  private getWebhookIdentifiers(payload: any): {
    reference?: string;
    providerReference?: string;
    withdrawalId?: string;
  } {
    const payout =
      payload.data?.object?.payout || payload.data?.payout || payload.payout;
    const metadata =
      payout?.metadata || payload.data?.metadata || payload.metadata;

    return {
      reference:
        payload.reference || payload.data?.reference || payout?.reference,
      providerReference:
        payload.data?.withdrawal_id ||
        payload.data?.payout_id ||
        payload.data?.id ||
        payout?.id,
      withdrawalId: metadata?.withdrawalId || metadata?.withdrawal_id,
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

  private async invalidateWithdrawalWallet(wallet: any): Promise<void> {
    await Promise.all([
      this.cacheService.invalidateByTag('withdrawals'),
      this.cacheService.invalidateByTag('finance'),
      this.cacheService.invalidatePattern('withdrawals:*'),
    ]);

    if (wallet.organizationId) {
      await this.walletService.invalidateWalletCache({
        type: 'ORGANIZATION',
        id: wallet.organizationId,
      });
    } else if (wallet.isPlatformWallet) {
      await this.walletService.invalidateWalletCache({ type: 'PLATFORM' });
    } else if (wallet.userId) {
      await this.walletService.invalidateWalletCache({
        type: 'USER',
        id: wallet.userId,
      });
    }
  }

  private verifyWebhookSignature(
    payload: any,
    signature: string,
    provider: string,
    timestamp?: string,
    rawBody?: Buffer,
  ): boolean {
    try {
      if (provider?.toLowerCase() === 'bachs') {
        return this.bachsClient.verifyWebhookSignature(
          rawBody || JSON.stringify(payload),
          signature,
          timestamp || '',
        );
      }
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
