// src/v1/finance/withdrawal-webhook.controller.ts

import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WithdrawalWebhookService } from './withdrawal-webhook.service';

@ApiTags('webhooks')
@Controller('webhooks/withdrawal')
export class WithdrawalWebhookController {
  private readonly logger = new Logger(WithdrawalWebhookController.name);

  constructor(
    private readonly withdrawalWebhookService: WithdrawalWebhookService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle withdrawal webhook from payment provider' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook payload' })
  async handleWithdrawalWebhook(
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-provider') provider: string,
    @Headers('x-request-id') requestId: string,
    @Body() payload: any,
  ) {
    this.logger.log(
      `Received withdrawal webhook from ${provider}, request-id: ${requestId}`,
    );

    if (!signature) {
      this.logger.warn('Webhook missing signature header');
      throw new BadRequestException('Missing signature');
    }

    // Process the webhook
    const result = await this.withdrawalWebhookService.processWebhook(
      provider,
      payload,
      signature,
    );

    return {
      received: true,
      event: payload.event || payload.type,
      withdrawalId: result?.withdrawalId,
      status: result?.status,
    };
  }
}
