import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appUrl = this.configService.get('APP_URL') || 'http://localhost:3000';
  }

  @Cron('*/10 * * * *') // Every 10 minutes
  async keepAlive() {
    try {
      const response = await axios.get(`${this.appUrl}/health`, {
        timeout: 10000,
      });
      this.logger.log(
        `Keep-alive: ${response.status} - ${response.statusText}`,
      );
    } catch (error) {
      this.logger.warn(`Keep-alive failed: ${error.message}`);
    }
  }

  // Also run on application startup
  @Cron(CronExpression.EVERY_5_SECONDS, {
    name: 'initial-keep-alive',
    disabled: false,
  })
  async initialPing() {
    // Run once to ensure the service is warmed up
    await this.keepAlive();
    // Stop this cron after first run
    this.initialPing = async () => {};
  }
}
