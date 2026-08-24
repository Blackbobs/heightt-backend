import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
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
    @Headers('x-request-id') requestId: string,
    @Body() payload: any,
  ) {
    const signature = sig1 || sig2 || sig3 || sig4;
    const eventType = payload.type || payload.event || payload.event_type;

    this.logger.log(
      `Received webhook event: ${eventType}, request-id: ${requestId}`,
    );

    // 1. Verify signature
    if (!this.bachsClient.verifyWebhookSignature(payload, signature)) {
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

      case 'collection.failed':
      case 'payment.failed':
      case 'charge.failed':
        await this.handleCollectionFailed(payload);
        break;

      case 'collection.underpaid':
        await this.handleCollectionUnderpaid(payload);
        break;

      case 'checkout.completed':
        await this.handleCheckoutCompleted(payload);
        break;

      case 'checkout.expired':
        await this.handleCheckoutExpired(payload);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
        break;
    }

    // Always return 200 OK to acknowledge receipt
    return { received: true, event: eventType };
  }

  /**
   * Handle successful payment collection
   */
  private async handleCollectionSucceeded(payload: any) {
    const data = payload.data || payload;
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
    const amount =
      data.amount || data.amount_paid || data.pricing?.amount || payload.amount;
    const customerId =
      data.customer?.id || data.customer_id || metadata.bachsCustomerId;

    this.logger.log(
      `Processing successful collection: charge ${chargeId}, checkout ${checkoutId}`,
    );

    try {
      const result = await this.bachsService.completePayment(
        checkoutId,
        chargeId,
        String(amount),
        customerId,
        metadata,
      );

      this.logger.log(`Payment completed: ${result.payment?.id || result.id}`);
    } catch (error: any) {
      this.logger.error(`Failed to complete payment: ${error.message}`);
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
   * Handle checkout completion
   */
  private async handleCheckoutCompleted(payload: any) {
    const data = payload.data;
    const checkoutId = data.checkout_id;
    const status = data.status;

    this.logger.log(`Checkout completed: ${checkoutId}, status: ${status}`);
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
