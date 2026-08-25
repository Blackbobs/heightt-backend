import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BachsClient } from './bachs.client';
import { BachsService } from './bachs.service';

@Controller('webhooks/bachs')
export class BachsWebhookController {
  private readonly logger = new Logger(BachsWebhookController.name);

  constructor(
    private readonly bachsClient: BachsClient,
    private readonly bachsService: BachsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-bachs-signature') sig1: string,
    @Headers('x-signature') sig2: string,
    @Headers('signature') sig3: string,
    @Headers('x-bachs-signature-256') sig4: string,
    @Headers('x-bachs-timestamp') timestamp: string,
    @Headers('x-request-id') requestId: string,
    @Body() payload: any,
    @Req() request: RawBodyRequest<Request>,
  ) {
    const signature = sig1 || sig2 || sig3 || sig4;
    const eventType = payload.type || payload.event || payload.event_type;

    this.logger.log(
      `Received webhook event: ${eventType}, request-id: ${requestId}`,
    );

    // 1. Verify signature
    if (
      !request.rawBody ||
      !this.bachsClient.verifyWebhookSignature(
        request.rawBody,
        signature,
        timestamp,
      )
    ) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    // 2. Handle specific events
    switch (eventType) {
      case 'collection.succeeded':
      case 'payment.succeeded':
      case 'charge.succeeded':
      case 'checkout.session.completed':
        await this.handleCollectionSucceeded(payload);
        break;

      // Bachs sends this immediately before/alongside collection.succeeded.
      // Acknowledge it, but fulfill only from the collection event to avoid two
      // concurrent transactions racing to create the same payment.
      case 'checkout.completed':
        this.logger.log(
          `Checkout completed: ${payload.data?.checkout_id || 'unknown'}; awaiting collection.succeeded`,
        );
        break;

      case 'collection.failed':
      case 'payment.failed':
      case 'charge.failed':
        await this.handleCollectionFailed(payload);
        break;

      case 'collection.underpaid':
        await this.handleCollectionUnderpaid(payload);
        break;

      case 'checkout.expired':
        await this.handleCheckoutExpired(payload);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
        break;
    }

    // Return 200 only after successful or idempotent processing.
    return { received: true, event: eventType };
  }

  /**
   * Handle successful payment collection
   */
  private async handleCollectionSucceeded(payload: any) {
    const data = payload.data?.object || payload.data || payload;
    const metadata = data.metadata || payload.metadata || {};
    const chargeId =
      data.charge_id || data.id || payload.id || `charge_${Date.now()}`;
    const checkoutId =
      data.checkout_id ||
      data.checkout_session_id ||
      data.checkoutId ||
      metadata.checkoutId ||
      metadata.bachsCheckoutId ||
      payload.checkout_id;
    // Bachs may add a customer-borne processing fee to `amount`. Heightt's
    // payment and organization credit are based on the settled checkout amount.
    const rawAmount =
      data.settlement_amount ??
      data.amount_paid ??
      data.amount ??
      data.pricing?.amount ??
      payload.amount;
    const amount =
      typeof rawAmount === 'object'
        ? (rawAmount?.value ?? rawAmount?.amount)
        : rawAmount;
    const customerId =
      data.customer?.id || data.customer_id || metadata.bachsCustomerId;

    this.logger.log(
      `Processing successful collection: charge ${chargeId}, checkout ${checkoutId}`,
    );

    if (!checkoutId || amount === undefined || amount === null) {
      throw new BadRequestException(
        'Successful payment webhook is missing checkout ID or amount',
      );
    }

    const currency =
      data.settlement_currency ||
      data.currency ||
      data.pricing?.currency ||
      rawAmount?.currency;
    if (currency && String(currency).toUpperCase() !== 'NGN') {
      throw new BadRequestException('Unexpected payment currency');
    }

    try {
      const result = await this.bachsService.completePayment(
        checkoutId,
        chargeId,
        String(amount),
        customerId,
        {
          ...metadata,
          providerEventId: payload.id,
          providerStatus: data.status,
          grossAmount: data.amount,
          settlementAmount: data.settlement_amount,
          processingFee: data.processing_fee,
          feeBearer: data.fee_bearer,
        },
      );

      this.logger.log(`Payment completed: ${result.payment?.id || result.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to complete payment: ${error.message}; code=${error.code || 'n/a'}; meta=${JSON.stringify(error.meta || {})}`,
        error.stack,
      );
      // Acknowledge only successful/idempotent processing. Non-2xx tells the
      // provider to retry transient failures and keeps reconciliation possible.
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Payment processing failed');
    }
  }

  /**
   * Handle failed payment collection
   */
  private async handleCollectionFailed(payload: any) {
    const data = payload.data;
    const chargeId = data.charge_id;
    const checkoutId = data.checkout_id;
    const reason = data.reason;

    this.logger.warn(`Payment failed: charge ${chargeId}, reason: ${reason}`);

    try {
      const pendingPayment = await this.bachsService[
        'prisma'
      ].pendingPayment.findFirst({
        where: { bachsCheckoutId: checkoutId },
      });

      if (pendingPayment) {
        await this.bachsService['prisma'].pendingPayment.update({
          where: { id: pendingPayment.id },
          data: {
            status: 'FAILED',
            metadata: {
              ...((pendingPayment.metadata as any) || {}),
              failureReason: reason,
              failedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update pending payment status: ${error.message}`,
      );
    }
  }

  /**
   * Handle underpaid collection - reject it
   */
  private async handleCollectionUnderpaid(payload: any) {
    const data = payload.data;
    const chargeId = data.charge_id;
    const checkoutId = data.checkout_id;
    const amountPaid = data.amount_paid;
    const amountExpected = data.amount_expected;

    this.logger.warn(
      `Payment underpaid: charge ${chargeId}, paid: ${amountPaid}, expected: ${amountExpected}`,
    );

    try {
      const pendingPayment = await this.bachsService[
        'prisma'
      ].pendingPayment.findFirst({
        where: { bachsCheckoutId: checkoutId },
      });

      if (pendingPayment) {
        await this.bachsService['prisma'].pendingPayment.update({
          where: { id: pendingPayment.id },
          data: {
            status: 'FAILED',
            metadata: {
              ...((pendingPayment.metadata as any) || {}),
              underpaid: true,
              amountPaid,
              amountExpected,
              failedAt: new Date().toISOString(),
              failureReason: `Underpaid: received ${amountPaid} but expected ${amountExpected}`,
            },
          },
        });
      }

      this.logger.log(`Underpayment rejected for checkout ${checkoutId}`);
    } catch (error) {
      this.logger.error(`Failed to handle underpayment: ${error.message}`);
    }
  }

  /**
   * Handle checkout expiry
   */
  private async handleCheckoutExpired(payload: any) {
    const data = payload.data;
    const checkoutId = data.checkout_id;

    this.logger.log(`Checkout expired: ${checkoutId}`);

    try {
      const pendingPayment = await this.bachsService[
        'prisma'
      ].pendingPayment.findFirst({
        where: { bachsCheckoutId: checkoutId },
      });

      if (pendingPayment) {
        await this.bachsService['prisma'].pendingPayment.update({
          where: { id: pendingPayment.id },
          data: {
            status: 'EXPIRED',
            metadata: {
              ...((pendingPayment.metadata as any) || {}),
              expiredAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update pending payment status: ${error.message}`,
      );
    }
  }
}
