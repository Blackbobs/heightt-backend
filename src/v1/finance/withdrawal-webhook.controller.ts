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
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
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
    @Headers('x-bachs-signature') bachsSignature: string,
    @Headers('x-bachs-timestamp') timestamp: string,
    @Headers('x-provider') provider: string,
    @Headers('x-request-id') requestId: string,
    @Body() payload: any,
    @Req() request: RawBodyRequest<Request>,
  ) {
    this.logger.log(
      `Received withdrawal webhook from ${provider}, request-id: ${requestId}`,
    );

    const suppliedSignature = bachsSignature || signature;
    if (!suppliedSignature) {
      this.logger.warn('Webhook missing signature header');
      throw new BadRequestException('Missing signature');
    }

    // Process the webhook
    const result = await this.withdrawalWebhookService.processWebhook(
      provider || (bachsSignature ? 'Bachs' : ''),
      payload,
      suppliedSignature,
      timestamp,
      request.rawBody,
    );

    return {
      received: true,
      event: payload.event || payload.type,
      withdrawalId: result?.withdrawalId,
      status: result?.status,
    };
  }
}
