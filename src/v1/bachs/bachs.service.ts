// src/v1/bachs/bachs.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BachsClient } from './bachs.client';
import { ConfigService } from '@nestjs/config';
import { EventService, SystemEvents } from '../../events/event.service';
import { CurrencyUtil } from '../../common/utils/currency.util';
import { CacheService } from '../../redis/cache.service';

export interface PendingPaymentData {
  userId: string;
  organizationId: string;
  amount: number;
  paymentMethod: string;
  description?: string;
  dueAssignmentId?: string;
  category?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

/**
 * Minimum amount (in Kobo) accepted by the Bachs payment provider
 * per checkout session. Bachs rejects smaller amounts with:
 * "amount must be at least 100.00 NGN"
 */
export const MIN_BACHS_CHECKOUT_AMOUNT_KOBO = 10_000; // ₦100

@Injectable()
export class BachsService {
  private readonly logger = new Logger(BachsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bachsClient: BachsClient,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly cacheService: CacheService,
  ) {}

  private getAllowedRedirectOrigins(): Set<string> {
    const configured =
      this.configService.get<string>('PAYMENT_REDIRECT_ORIGINS') ||
      this.configService.get<string>('CORS_ORIGIN') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3001';

    return new Set(
      configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new URL(value).origin),
    );
  }

  private validateRedirectUrl(url: string, field: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`${field} must be a valid URL`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(`${field} must use HTTP or HTTPS`);
    }

    if (!this.getAllowedRedirectOrigins().has(parsed.origin)) {
      throw new BadRequestException(`${field} origin is not allowed`);
    }

    return parsed.toString();
  }

  /**
   * Create a checkout session for a payment
   */
  async initiatePayment(
    userId: string,
    paymentData: PendingPaymentData,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{
    checkoutId: string;
    checkoutUrl: string;
    pendingPaymentId: string;
    baseAmount: number;
    platformFee: number;
    totalBeforeGatewayFee: number;
  }> {
    // 0. Validate amount against the Bachs provider minimum before any
    //    DB writes or external calls (Bachs rejects amounts below ₦100)
    if (paymentData.amount < MIN_BACHS_CHECKOUT_AMOUNT_KOBO) {
      throw new BadRequestException(
        `Amount must be at least ${CurrencyUtil.formatNaira(
          MIN_BACHS_CHECKOUT_AMOUNT_KOBO,
        )} (${MIN_BACHS_CHECKOUT_AMOUNT_KOBO} Kobo)`,
      );
    }

    const platformFeeAmount = this.configService.get<number>(
      'fees.platform.amountKobo',
      10000,
    );
    const platformFeeEnabled = this.configService.get<boolean>(
      'fees.platform.enabled',
      true,
    );
    const platformFee = platformFeeEnabled ? platformFeeAmount : 0;
    const settlementAmount = paymentData.amount + platformFee;

    // 1. Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Get or create Bachs customer
    const customerName = user.profile
      ? `${user.profile.firstName || ''} ${user.profile.lastName || ''}`.trim()
      : user.username || 'Customer';

    const bachsCustomer = await this.bachsClient.getOrCreateCustomer(
      user.email,
      customerName || 'Customer',
      undefined,
    );

    // 3. Create pending payment record
    const pendingPayment = await this.prisma
      .$transaction(async (tx) => {
        if (paymentData.dueAssignmentId) {
          const completedDuePayment = await tx.duePayment.findUnique({
            where: { assignmentId: paymentData.dueAssignmentId },
            select: { id: true },
          });
          if (completedDuePayment) {
            throw new BadRequestException('This due has already been paid');
          }
        }

        // Reuse only a checkout for the same due/payment purpose. Previously a
        // pending checkout for any other due in the organization could be reused.
        const existing = await tx.pendingPayment.findFirst({
          where: {
            userId,
            organizationId: paymentData.organizationId,
            dueAssignmentId: paymentData.dueAssignmentId || null,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          const expiresAt = new Date(existing.createdAt);
          expiresAt.setMinutes(expiresAt.getMinutes() + 60);

          if (new Date() >= expiresAt) {
            await tx.pendingPayment.update({
              where: { id: existing.id },
              data: {
                status: 'EXPIRED',
                metadata: {
                  ...((existing.metadata as any) || {}),
                  expiredAt: new Date().toISOString(),
                  reason: 'Payment session expired before retry',
                },
              },
            });
          } else if (!existing.bachsCheckoutId) {
            // A previous provider request may have failed after the database row
            // was created. Reuse that row instead of violating the one-active-
            // payment-per-due constraint.
            return existing;
          } else {
            try {
              const checkout = await this.bachsClient.getCheckoutSession(
                existing.bachsCheckoutId,
              );
              const checkoutStatus = String(
                checkout.status || '',
              ).toUpperCase();
              if (checkoutStatus === 'OPEN') {
                return {
                  ...existing,
                  checkoutUrl: checkout.checkout_url,
                };
              }

              if (
                checkoutStatus === 'EXPIRED' ||
                checkoutStatus === 'CANCELLED'
              ) {
                await tx.pendingPayment.update({
                  where: { id: existing.id },
                  data: {
                    status:
                      checkoutStatus === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED',
                  },
                });
              } else {
                throw new ConflictException({
                  statusCode: 409,
                  code: 'PAYMENT_ALREADY_IN_PROGRESS',
                  message: 'A payment for this due is already being confirmed',
                  pendingPaymentId: existing.id,
                  checkoutId: existing.bachsCheckoutId,
                  statusUrl: `/api/v1/finance/payments/pending/${existing.id}/status`,
                });
              }
            } catch (error) {
              if (error instanceof ConflictException) throw error;
              this.logger.warn(
                `Existing checkout ${existing.bachsCheckoutId} is invalid`,
              );
              throw new ConflictException({
                statusCode: 409,
                code: 'PAYMENT_STATUS_UNAVAILABLE',
                message:
                  'The existing payment could not be checked. Please check its status before trying again.',
                pendingPaymentId: existing.id,
                checkoutId: existing.bachsCheckoutId,
                statusUrl: `/api/v1/finance/payments/pending/${existing.id}/status`,
              });
            }
          }
        }

        const reference =
          paymentData.reference ||
          `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        return tx.pendingPayment.create({
          data: {
            userId,
            organizationId: paymentData.organizationId,
            amount: paymentData.amount,
            paymentMethod: paymentData.paymentMethod,
            description: paymentData.description,
            dueAssignmentId: paymentData.dueAssignmentId,
            category: paymentData.category || 'OTHER',
            reference,
            metadata: {
              ...(paymentData.metadata || {}),
              baseAmount: paymentData.amount,
              platformFee,
              platformFeeType: 'FIXED',
              expectedSettlementAmount: settlementAmount,
            },
            status: 'PENDING',
          },
        });
      })
      .catch((error: any) => {
        if (error?.code === 'P2002' && paymentData.dueAssignmentId) {
          throw new ConflictException({
            statusCode: 409,
            code: 'PAYMENT_ALREADY_IN_PROGRESS',
            message: 'A payment for this due is already in progress',
          });
        }
        throw error;
      });

    if ((pendingPayment as any).checkoutUrl) {
      return {
        checkoutId: pendingPayment.bachsCheckoutId!,
        checkoutUrl: (pendingPayment as any).checkoutUrl,
        pendingPaymentId: pendingPayment.id,
        baseAmount: Number(
          (pendingPayment.metadata as any)?.baseAmount || pendingPayment.amount,
        ),
        platformFee: Number((pendingPayment.metadata as any)?.platformFee || 0),
        totalBeforeGatewayFee: Number(
          (pendingPayment.metadata as any)?.expectedSettlementAmount ||
            pendingPayment.amount,
        ),
      };
    }

    // 4. Prepare Bachs checkout payload
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:3001';
    const bachsAmount = this.bachsClient.toBachsAmount(settlementAmount);

    const defaultSuccessUrl = `${frontendUrl}/payment/callback`;
    const defaultCancelUrl = `${frontendUrl}/payment/cancelled`;
    const requestedSuccessUrl = this.validateRedirectUrl(
      successUrl || defaultSuccessUrl,
      'successUrl',
    );
    const requestedCancelUrl = this.validateRedirectUrl(
      cancelUrl || defaultCancelUrl,
      'cancelUrl',
    );
    const callbackUrl = new URL(requestedSuccessUrl);
    callbackUrl.searchParams.set('payment', pendingPayment.id);
    const cancellationUrl = new URL(requestedCancelUrl);
    cancellationUrl.searchParams.set('payment', pendingPayment.id);

    const checkoutPayload = {
      customer: {
        customer_id: bachsCustomer.id, // FIX: Use the Bachs customer ID
        email: user.email, // Also include email as fallback
        name: customerName || 'Customer', // Include name as well
      },
      pricing: {
        currency: 'NGN',
        amount: bachsAmount,
        price_type: 'fixed' as const,
      },
      reference: `checkout_${pendingPayment.id.substring(0, 8)}`,
      metadata: {
        pendingPaymentId: pendingPayment.id,
        userId: userId,
        organizationId: paymentData.organizationId,
        internalReference: pendingPayment.reference,
        baseAmount: paymentData.amount,
        platformFee,
        expectedSettlementAmount: settlementAmount,
      },
      success_url: callbackUrl.toString(),
      cancel_url: cancellationUrl.toString(),
      expires_in_minutes: 60,
    };

    // 5. Create checkout session
    const checkoutSession =
      await this.bachsClient.createCheckoutSession(checkoutPayload);

    // 6. Update pending payment with checkout ID
    await this.prisma.pendingPayment.update({
      where: { id: pendingPayment.id },
      data: {
        bachsCheckoutId: checkoutSession.checkout_id,
        bachsCustomerId: bachsCustomer.id,
        metadata: {
          ...((pendingPayment.metadata as any) || {}),
          baseAmount: paymentData.amount,
          platformFee,
          platformFeeType: 'FIXED',
          expectedSettlementAmount: settlementAmount,
          checkoutSession,
        },
      },
    });

    this.logger.log(
      `Created checkout session ${checkoutSession.checkout_id} for pending payment ${pendingPayment.id}`,
    );

    return {
      checkoutId: checkoutSession.checkout_id,
      checkoutUrl: checkoutSession.checkout_url,
      pendingPaymentId: pendingPayment.id,
      baseAmount: paymentData.amount,
      platformFee,
      totalBeforeGatewayFee: settlementAmount,
    };
  }

  /**
   * Complete a payment after successful webhook
   */
  async completePayment(
    checkoutId: string,
    chargeId: string,
    amountInBachs: string,
    customerId: string,
    paymentData?: any,
  ): Promise<any> {
    this.logger.log(
      `Completing payment for checkout ${checkoutId} with charge ${chargeId}`,
    );

    const result = await this.prisma
      .$transaction(
        async (tx) => {
          const pendingPaymentIdFromMeta =
            paymentData?.pendingPaymentId ||
            paymentData?.metadata?.pendingPaymentId;
          const internalRefFromMeta =
            paymentData?.internalReference ||
            paymentData?.metadata?.internalReference;

          const pendingPayment = await tx.pendingPayment.findFirst({
            where: {
              OR: [
                ...(checkoutId ? [{ bachsCheckoutId: checkoutId }] : []),
                ...(pendingPaymentIdFromMeta
                  ? [{ id: pendingPaymentIdFromMeta }]
                  : []),
                ...(internalRefFromMeta
                  ? [{ reference: internalRefFromMeta }]
                  : []),
              ],
            },
            include: {
              user: true,
              organization: true,
            },
          });

          if (!pendingPayment) {
            throw new NotFoundException(
              `Pending payment not found for checkout ${checkoutId || 'unknown'}`,
            );
          }

          const existingPayment = await tx.payment.findFirst({
            where: { reference: pendingPayment.reference },
            include: { receipt: true },
          });

          if (existingPayment) {
            this.logger.log(
              `Payment ${pendingPayment.reference} already processed`,
            );
            return {
              payment: existingPayment,
              transaction: null,
              organizationBalance: null,
              pendingPaymentId: pendingPayment.id,
              alreadyProcessed: true,
              shouldGenerateReceipt: !existingPayment.receipt,
            };
          }

          if (pendingPayment.status !== 'PENDING') {
            throw new BadRequestException(
              `Payment cannot be completed from ${pendingPayment.status} status`,
            );
          }

          const amountInKobo = this.bachsClient.fromBachsAmount(amountInBachs);
          if (!Number.isSafeInteger(amountInKobo) || amountInKobo <= 0) {
            throw new BadRequestException(
              'Provider returned an invalid amount',
            );
          }
          const pendingMetadata = (pendingPayment.metadata as any) || {};
          const platformFee = Number(pendingMetadata.platformFee || 0);
          const expectedSettlementAmount =
            pendingMetadata.expectedSettlementAmount ||
            pendingPayment.amount + platformFee;
          if (amountInKobo !== expectedSettlementAmount) {
            throw new BadRequestException(
              `Payment settlement mismatch: expected ${expectedSettlementAmount} Kobo, received ${amountInKobo} Kobo`,
            );
          }
          if (
            pendingPayment.bachsCheckoutId &&
            checkoutId !== pendingPayment.bachsCheckoutId
          ) {
            throw new BadRequestException('Checkout ID does not match payment');
          }

          let orgWallet: any = await tx.wallet.findUnique({
            where: { organizationId: pendingPayment.organizationId },
            include: { ledgerAccount: true },
          });

          if (!orgWallet) {
            const wallet = await tx.wallet.create({
              data: {
                organizationId: pendingPayment.organizationId,
                currency: 'NGN',
                status: 'ACTIVE',
              },
            });
            const ledgerAccount = await tx.ledgerAccount.create({
              data: {
                code: `ORG-WALLET-${wallet.id.substring(0, 12)}`,
                name: `${pendingPayment.organization.name} Wallet`,
                type: 'ASSET',
                category: 'CASH',
                ownerType: 'ORGANIZATION',
                ownerId: pendingPayment.organizationId,
                organizationId: pendingPayment.organizationId,
                walletId: wallet.id,
                isActive: true,
              },
            });
            orgWallet = await tx.wallet.update({
              where: { id: wallet.id },
              data: { ledgerAccountId: ledgerAccount.id },
              include: { ledgerAccount: true },
            });
          }
          if (orgWallet.status !== 'ACTIVE' || !orgWallet.ledgerAccountId) {
            throw new BadRequestException(
              'Organization wallet or ledger account is not active',
            );
          }

          let platformWallet = await tx.wallet.findFirst({
            where: { isPlatformWallet: true },
            include: { ledgerAccount: true },
          });
          if (platformFee > 0 && !platformWallet) {
            const wallet = await tx.wallet.create({
              data: {
                currency: 'NGN',
                status: 'ACTIVE',
                isPlatformWallet: true,
              },
            });
            const ledgerAccount = await tx.ledgerAccount.create({
              data: {
                code: `PLATFORM-WALLET-${wallet.id.substring(0, 12)}`,
                name: 'Platform Wallet',
                type: 'ASSET',
                category: 'CASH',
                ownerType: 'PLATFORM',
                walletId: wallet.id,
                description: 'Heightt platform service-fee wallet',
                isSystem: true,
                isActive: true,
              },
            });
            platformWallet = await tx.wallet.update({
              where: { id: wallet.id },
              data: { ledgerAccountId: ledgerAccount.id },
              include: { ledgerAccount: true },
            });
          }
          if (
            platformFee > 0 &&
            (!platformWallet ||
              platformWallet.status !== 'ACTIVE' ||
              !platformWallet.ledgerAccountId)
          ) {
            throw new BadRequestException(
              'Platform wallet or ledger account is not active',
            );
          }

          // An external collection is funded by Bachs, not by the student's
          // pre-existing Heightt wallet. Record the provider clearing asset as the
          // debit side and the organization wallet as the credit side.
          const clearingAccount = await tx.ledgerAccount.upsert({
            where: { code: '1200' },
            create: {
              code: '1200',
              name: 'Bachs Settlement Account',
              type: 'ASSET',
              category: 'SETTLEMENT',
              ownerType: 'SYSTEM',
              description: 'Funds collected externally and awaiting settlement',
              isSystem: true,
              isActive: true,
            },
            update: {},
          });

          const orgWalletBalanceBefore = orgWallet.balance;
          const orgWalletBalanceAfter =
            orgWalletBalanceBefore + pendingPayment.amount;
          const platformBalanceBefore = platformWallet?.balance || 0;
          const platformBalanceAfter = platformBalanceBefore + platformFee;
          const clearingBalanceBefore = clearingAccount.balance;
          const clearingBalanceAfter = clearingBalanceBefore + amountInKobo;

          const transaction = await tx.transaction.create({
            data: {
              walletId: orgWallet.id,
              type: 'CREDIT',
              amount: amountInKobo,
              fee: platformFee,
              netAmount: pendingPayment.amount,
              status: 'COMPLETED',
              reference: pendingPayment.reference,
              description: pendingPayment.description || 'Payment via Bachs',
              completedAt: new Date(),
              metadata: {
                bachsChargeId: chargeId,
                bachsCheckoutId: checkoutId,
                bachsCustomerId: customerId,
                baseAmount: pendingPayment.amount,
                platformFee,
                settledAmount: amountInKobo,
                ...paymentData,
              },
            },
          });

          await tx.ledgerEntry.createMany({
            data: [
              {
                accountId: clearingAccount.id,
                transactionId: transaction.id,
                amount: amountInKobo,
                type: 'DEBIT',
                balanceBefore: clearingBalanceBefore,
                balanceAfter: clearingBalanceAfter,
                description: `Bachs collection ${chargeId}`,
              },
              {
                accountId: orgWallet.ledgerAccountId!,
                transactionId: transaction.id,
                amount: pendingPayment.amount,
                type: 'CREDIT',
                balanceBefore: orgWalletBalanceBefore,
                balanceAfter: orgWalletBalanceAfter,
                description: `Payment from ${pendingPayment.user.email} via Bachs`,
              },
              ...(platformFee > 0
                ? [
                    {
                      accountId: platformWallet!.ledgerAccountId!,
                      transactionId: transaction.id,
                      amount: platformFee,
                      type: 'CREDIT' as const,
                      balanceBefore: platformBalanceBefore,
                      balanceAfter: platformBalanceAfter,
                      description: 'Heightt platform service fee',
                    },
                  ]
                : []),
            ],
          });

          await tx.wallet.update({
            where: { id: orgWallet.id },
            data: { balance: orgWalletBalanceAfter },
          });

          await tx.ledgerAccount.update({
            where: { id: orgWallet.ledgerAccountId! },
            data: { balance: orgWalletBalanceAfter },
          });
          if (platformFee > 0) {
            await tx.wallet.update({
              where: { id: platformWallet!.id },
              data: { balance: platformBalanceAfter },
            });
            await tx.ledgerAccount.update({
              where: { id: platformWallet!.ledgerAccountId! },
              data: { balance: platformBalanceAfter },
            });
          }
          await tx.ledgerAccount.update({
            where: { id: clearingAccount.id },
            data: { balance: clearingBalanceAfter },
          });

          const payment = await tx.payment.create({
            data: {
              payerId: pendingPayment.userId,
              organizationId: pendingPayment.organizationId,
              transactionId: transaction.id,
              amount: pendingPayment.amount,
              serviceFee: platformFee,
              status: 'COMPLETED',
              paymentMethod: pendingPayment.paymentMethod as any,
              reference: pendingPayment.reference,
              description: pendingPayment.description,
              paidAt: new Date(),
              bachsChargeId: chargeId,
              bachsCheckoutId: checkoutId,
              bachsCustomerId: customerId,
              metadata: {
                pendingPaymentId: pendingPayment.id,
                baseAmount: pendingPayment.amount,
                platformFee,
                totalBeforeGatewayFee: amountInKobo,
                ...paymentData,
              },
            },
          });

          const journalEntry = await tx.journalEntry.create({
            data: {
              reference: `JE-BACHS-${chargeId}`,
              description:
                pendingPayment.description || 'External payment via Bachs',
              transactionId: transaction.id,
              paymentId: payment.id,
              status: 'POSTED',
              isBalanced: true,
              createdBy: pendingPayment.userId,
              lines: {
                create: [
                  {
                    ledgerAccountId: clearingAccount.id,
                    type: 'DEBIT',
                    amount: amountInKobo,
                    description: `Bachs collection ${chargeId}`,
                  },
                  {
                    ledgerAccountId: orgWallet.ledgerAccountId!,
                    type: 'CREDIT',
                    amount: pendingPayment.amount,
                    description: `Payment to ${pendingPayment.organization.name}`,
                  },
                  ...(platformFee > 0
                    ? [
                        {
                          ledgerAccountId: platformWallet!.ledgerAccountId!,
                          type: 'CREDIT' as const,
                          amount: platformFee,
                          description: 'Heightt platform service fee',
                        },
                      ]
                    : []),
                ],
              },
            },
          });
          await tx.transaction.update({
            where: { id: transaction.id },
            data: { journalEntryId: journalEntry.id },
          });
          await tx.payment.update({
            where: { id: payment.id },
            data: { journalEntryId: journalEntry.id },
          });

          if (pendingPayment.dueAssignmentId) {
            const dueAssignment = await tx.dueAssignment.findUnique({
              where: { id: pendingPayment.dueAssignmentId },
              include: { due: true },
            });

            if (dueAssignment && !dueAssignment.isPaid) {
              const totalPaid = await tx.duePayment.aggregate({
                where: { assignmentId: dueAssignment.id },
                _sum: { amount: true },
              });

              const totalPaidAmount = totalPaid._sum.amount || 0;
              const isFullyPaid =
                totalPaidAmount + pendingPayment.amount >= dueAssignment.amount;

              await tx.duePayment.create({
                data: {
                  assignmentId: dueAssignment.id,
                  paymentId: payment.id,
                  amount: pendingPayment.amount,
                  paidAt: new Date(),
                },
              });

              if (isFullyPaid) {
                await tx.dueAssignment.update({
                  where: { id: dueAssignment.id },
                  data: {
                    isPaid: true,
                    paidAt: new Date(),
                  },
                });
              }
            }
          }

          await tx.pendingPayment.update({
            where: { id: pendingPayment.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              bachsChargeId: chargeId,
            },
          });

          await tx.activityLog.create({
            data: {
              userId: pendingPayment.userId,
              activity: 'PAYMENT_COMPLETED_VIA_BACHS',
              details: JSON.stringify({
                paymentId: payment.id,
                amount: pendingPayment.amount,
                platformFee,
                settledAmount: amountInKobo,
                reference: transaction.reference,
                organizationId: pendingPayment.organizationId,
                bachsChargeId: chargeId,
                bachsCheckoutId: checkoutId,
              }),
            },
          });

          return {
            payment,
            transaction,
            organizationBalance: orgWalletBalanceAfter,
            pendingPaymentId: pendingPayment.id,
            alreadyProcessed: false,
            shouldGenerateReceipt: true,
          };
        },
        {
          // Render-hosted PostgreSQL can exceed Prisma's 5-second default during
          // the balanced ledger, wallet, due, payment, and audit writes below.
          maxWait: 10_000,
          timeout: 30_000,
        },
      )
      .catch((error: any) => {
        const target = JSON.stringify(error?.meta?.target || '');
        if (error?.code === 'P2002' && target.includes('assignmentId')) {
          throw new BadRequestException('This due has already been paid');
        }
        throw error;
      });

    // The wallet endpoints are cached, so successful database credits would
    // otherwise remain invisible until their TTL expires.
    try {
      await Promise.all([
        this.cacheService.delete(
          `wallet:organization:${result.payment.organizationId}`,
        ),
        this.cacheService.delete('wallet:platform'),
        this.cacheService.invalidateByTag('transactions'),
        this.cacheService.invalidateByTag('finance'),
      ]);
    } catch (error: any) {
      this.logger.warn(
        `Payment completed but wallet cache invalidation failed: ${error.message}`,
      );
    }

    // Consumers query Payment/Receipt using their own connection, so events
    // must only run after the transaction above has committed.
    if (!result.alreadyProcessed) {
      this.eventService.emitPaymentReceived({
        paymentId: result.payment.id,
        userId: result.payment.payerId,
        organizationId: result.payment.organizationId,
        amount: result.payment.amount,
        reference: result.payment.reference,
        metadata: { bachsChargeId: chargeId, bachsCheckoutId: checkoutId },
      });
    }
    if (result.shouldGenerateReceipt) {
      await this.eventService.emitAsync(
        SystemEvents.PAYMENT_COMPLETED_VIA_BACHS,
        {
          paymentId: result.payment.id,
          userId: result.payment.payerId,
          chargeId,
          checkoutId,
        },
      );
    }

    this.logger.log(
      `Payment completed: ${result.payment.id} via Bachs charge ${chargeId}`,
    );
    return result;
  }

  /**
   * Cancel a pending payment
   */
  async cancelPendingPayment(
    pendingPaymentId: string,
    userId?: string,
  ): Promise<void> {
    const pendingPayment = await this.prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });

    if (!pendingPayment) {
      throw new NotFoundException('Pending payment not found');
    }

    if (userId && pendingPayment.userId !== userId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    if (pendingPayment.status !== 'PENDING') {
      throw new BadRequestException('Payment is not pending');
    }

    await this.prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: 'CANCELLED',
        metadata: {
          ...((pendingPayment.metadata as any) || {}),
          cancelledAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Get pending payment status
   */
  async getPendingPaymentStatus(
    pendingPaymentId: string,
    userId: string,
  ): Promise<any> {
    let pendingPayment = await this.prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: {
        user: { select: { id: true } },
      },
    });

    if (!pendingPayment) {
      throw new NotFoundException('Pending payment not found');
    }

    if (pendingPayment.userId !== userId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    // If still pending, check with Bachs for updated status
    if (pendingPayment.status === 'PENDING' && pendingPayment.bachsCheckoutId) {
      try {
        const checkout = await this.bachsClient.getCheckoutSession(
          pendingPayment.bachsCheckoutId,
        );
        const checkoutStatus = String(checkout.status || '').toUpperCase();
        if (checkoutStatus === 'COMPLETED' || checkoutStatus === 'SUCCEEDED') {
          const providerPayment =
            checkout.payment ||
            checkout.charge ||
            checkout.collection ||
            checkout;
          const chargeId =
            providerPayment.payment_id ||
            providerPayment.charge_id ||
            providerPayment.id;
          const amount =
            providerPayment.settlement_amount ||
            providerPayment.amount_paid ||
            providerPayment.amount ||
            checkout.pricing?.amount;
          const customerId =
            providerPayment.customer?.id ||
            providerPayment.customer_id ||
            checkout.customer?.id;

          // Reconcile only when the provider lookup supplies independently
          // verifiable payment details. Otherwise the signed webhook remains
          // authoritative and the client sees PROCESSING rather than success.
          if (chargeId && amount !== undefined && amount !== null) {
            await this.completePayment(
              pendingPayment.bachsCheckoutId,
              String(chargeId),
              String(
                typeof amount === 'object'
                  ? amount.value || amount.amount
                  : amount,
              ),
              customerId ? String(customerId) : '',
              checkout.metadata || providerPayment.metadata,
            );
            pendingPayment = (await this.prisma.pendingPayment.findUnique({
              where: { id: pendingPaymentId },
              include: { user: { select: { id: true } } },
            }))!;
          } else {
            this.logger.warn(
              `Checkout ${pendingPayment.bachsCheckoutId} is completed but lacks charge details; awaiting webhook`,
            );
          }
        } else if (
          checkoutStatus === 'EXPIRED' ||
          checkoutStatus === 'CANCELLED'
        ) {
          await this.prisma.pendingPayment.update({
            where: { id: pendingPaymentId },
            data: {
              status: checkoutStatus === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED',
            },
          });
          pendingPayment.status =
            checkoutStatus === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
        }
      } catch (error) {
        this.logger.error(`Failed to check checkout status: ${error.message}`);
      }
    }

    let payment = await this.prisma.payment.findFirst({
      where: { reference: pendingPayment.reference },
      include: { receipt: { select: { id: true, receiptNumber: true } } },
    });
    if (payment && !payment.receipt) {
      await this.eventService.emitAsync(
        SystemEvents.PAYMENT_COMPLETED_VIA_BACHS,
        {
          paymentId: payment.id,
          userId: pendingPayment.userId,
          chargeId: payment.bachsChargeId || '',
          checkoutId: payment.bachsCheckoutId || '',
        },
      );
      payment = await this.prisma.payment.findFirst({
        where: { id: payment.id },
        include: { receipt: { select: { id: true, receiptNumber: true } } },
      });
    }
    const status =
      pendingPayment.status === 'PENDING' && payment
        ? 'COMPLETED'
        : pendingPayment.status === 'PENDING' && pendingPayment.bachsCheckoutId
          ? 'PROCESSING'
          : pendingPayment.status;
    const retryable = ['FAILED', 'EXPIRED', 'CANCELLED'].includes(status);

    return {
      id: pendingPayment.id,
      status,
      amount: pendingPayment.amount,
      reference: pendingPayment.reference,
      checkoutId: pendingPayment.bachsCheckoutId,
      paymentId: payment?.id || null,
      receiptId: payment?.receipt?.id || null,
      receiptNumber: payment?.receipt?.receiptNumber || null,
      retryable,
      nextAction:
        status === 'COMPLETED'
          ? 'SHOW_SUCCESS'
          : retryable
            ? 'RETRY_PAYMENT'
            : status === 'PENDING'
              ? 'RETRY_CHECKOUT_CREATION'
              : 'WAIT_FOR_CONFIRMATION',
      failureReason:
        status === 'FAILED'
          ? ((pendingPayment.metadata as any)?.failureReason ?? null)
          : null,
      completedAt: pendingPayment.completedAt,
      createdAt: pendingPayment.createdAt,
    };
  }

  /**
   * Get all pending payments for a user
   */
  async getUserPendingPayments(userId: string): Promise<any[]> {
    return this.prisma.pendingPayment.findMany({
      where: {
        userId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cleanup expired pending payments
   * This should be called by a cron job
   */
  async cleanupExpiredPayments(): Promise<number> {
    const expiryMinutes = 60;
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - expiryMinutes);

    const expiredPayments = await this.prisma.pendingPayment.updateMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lt: cutoffTime,
        },
      },
      data: {
        status: 'EXPIRED',
        metadata: {
          expiredAt: new Date().toISOString(),
          reason: 'Payment session expired',
        },
      },
    });

    this.logger.log(
      `Cleaned up ${expiredPayments.count} expired pending payments`,
    );
    return expiredPayments.count;
  }

  /**
   * Retry failed pending payments (for webhook retries)
   */
  async retryFailedPayment(pendingPaymentId: string): Promise<any> {
    const pendingPayment = await this.prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });

    if (!pendingPayment) {
      throw new NotFoundException('Pending payment not found');
    }

    if (pendingPayment.status !== 'FAILED') {
      throw new BadRequestException('Payment is not in failed state');
    }

    // Increment retry count
    const retryCount = ((pendingPayment.metadata as any)?.retryCount || 0) + 1;

    if (retryCount > 3) {
      throw new BadRequestException('Maximum retry attempts exceeded');
    }

    // Reset status to PENDING
    await this.prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: 'PENDING',
        metadata: {
          ...((pendingPayment.metadata as any) || {}),
          retryCount,
          retriedAt: new Date().toISOString(),
        },
      },
    });

    // Return the pending payment data for retry processing
    return {
      ...pendingPayment,
      retryCount,
    };
  }

  /**
   * Validate if a payment can be made
   */
  async validatePayment(
    userId: string,
    organizationId: string,
    amount: number,
  ): Promise<{ valid: boolean; message?: string }> {
    // Check if amount meets minimum
    if (amount < MIN_BACHS_CHECKOUT_AMOUNT_KOBO) {
      return {
        valid: false,
        message: `Amount must be at least ${CurrencyUtil.formatNaira(
          MIN_BACHS_CHECKOUT_AMOUNT_KOBO,
        )}`,
      };
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        valid: false,
        message: 'User not found',
      };
    }

    // Check if organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return {
        valid: false,
        message: 'Organization not found',
      };
    }

    // Check if user is a member of the organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      return {
        valid: false,
        message: 'You are not a member of this organization',
      };
    }

    return { valid: true };
  }
}
