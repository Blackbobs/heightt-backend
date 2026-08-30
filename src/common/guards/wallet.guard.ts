// src/common/guards/wallet.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { WalletService } from '../../v1/finance/wallet.service';

@Injectable()
export class WalletGuard implements CanActivate {
  private readonly logger = new Logger(WalletGuard.name);

  constructor(private readonly walletService: WalletService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      return true; // Let other guards handle authentication
    }

    try {
      // Use WalletService to get or create user wallet
      await this.walletService.getOrCreateWallet({
        type: 'USER',
        id: userId,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to ensure wallet for user ${userId}: ${error.message}`,
      );
      // Don't block the request if wallet creation fails
      return true;
    }
  }
}
