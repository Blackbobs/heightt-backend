import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Use the Render URL or fallback
    this.appUrl = this.configService.get('APP_URL') || 
                  this.configService.get('RENDER_EXTERNAL_URL') ||
                  'http://localhost:3000';
    
    this.logger.log(`Keep-alive service configured with URL: ${this.appUrl}`);
  }

  @Cron('*/14 * * * *') // Every 14 minutes
  async keepAlive() {
    try {
      const url = `${this.appUrl}/health`;
      this.logger.debug(`Pinging: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'KeepAlive/1.0',
        },
      });
      
      this.logger.log(
        `✅ Keep-alive: ${response.status} - ${response.statusText} at ${new Date().toISOString()}`,
      );
    } catch (error) {
      if (error.response) {
        this.logger.warn(`Keep-alive failed: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        this.logger.warn(`Keep-alive failed: No response - ${error.message}`);
      } else {
        this.logger.warn(`Keep-alive failed: ${error.message}`);
      }
    }
  }

  // Run once on startup
  @Cron(CronExpression.EVERY_30_SECONDS, {
    name: 'initial-keep-alive',
    disabled: false,
  })
  async initialPing() {
    await this.keepAlive();
    // Disable this cron after first run
    this.initialPing = async () => {};
  }
}