import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appUrl =
      this.configService.get('APP_URL') ||
      this.configService.get('RENDER_EXTERNAL_URL') ||
      'http://localhost:3000';
    this.logger.log(`Keep-alive service configured with URL: ${this.appUrl}`);
    this.logger.log(`⏰ Will ping every 14 minutes to keep server alive`);
  }

  @Cron('*/14 * * * *') // Every 14 minutes
  async keepAlive() {
    try {
      const url = `${this.appUrl}/api/v1/health`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'KeepAlive/1.0',
        },
      });

      this.logger.debug(
        `✅ Keep-alive: ${response.status} at ${new Date().toISOString()}`,
      );
    } catch (error) {
      // Silent fail - don't log every failure to avoid log noise
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        // Server might be starting up or sleeping, this is expected
        return;
      }
      this.logger.warn(`Keep-alive failed: ${error.message}`);
    }
  }
}
