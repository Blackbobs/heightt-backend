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
    @Headers('x-bachs-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Body() payload: any,
  ) {
    this.logger.log(
      `Received webhook event: ${payload.type}, request-id: ${requestId}`,
    );

    // 1. Verify signature
    if (!signature) {
      this.logger.warn('Webhook missing signature header');
      throw new BadRequestException('Missing signature');
    }

    if (!this.bachsClient.verifyWebhookSignature(payload, signature)) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    // 2. Handle specific events
    switch (payload.type) {
      case 'collection.succeeded':
        await this.handleCollectionSucceeded(payload);
        break;

      case 'collection.failed':
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
        this.logger.log(`Unhandled webhook event type: ${payload.type}`);
        break;
    }

    // Always return 200 OK to acknowledge receipt
    return { received: true, event: payload.type };
  }

  /**
   * Handle successful payment collection
   */
  private async handleCollectionSucceeded(payload: any) {
    const data = payload.data;
    const chargeId = data.charge_id;
    const checkoutId = data.checkout_id;
    const amount = data.amount;
    const customerId = data.customer?.id;
    const metadata = data.metadata || {};

    this.logger.log(`Processing successful collection: charge ${chargeId}`);

    try {
      const result = await this.bachsService.completePayment(
        checkoutId,
        chargeId,
        amount,
        customerId,
        metadata,
      );

      this.logger.log(`Payment completed: ${result.payment.id}`);
    } catch (error) {
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
