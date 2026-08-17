import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletGuard implements CanActivate {
  private readonly logger = new Logger(WalletGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      return true; // Let other guards handle authentication
    }

    try {
      // Check if user has a wallet
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId },
      });

      // If no wallet exists, create one
      if (!wallet) {
        this.logger.log(`Creating wallet for user: ${userId}`);
        
        // Create wallet in a transaction with ledger account
        await this.prisma.$transaction(async (tx) => {
          const newWallet = await tx.wallet.create({
            data: {
              userId,
              currency: 'NGN',
              balance: 0,
              heldBalance: 0,
              status: 'ACTIVE',
            },
          });

          // Create ledger account for the wallet
          const ledgerAccount = await tx.ledgerAccount.create({
            data: {
              code: `WALLET-${newWallet.id.substring(0, 8)}`,
              name: `User Wallet - ${newWallet.id.substring(0, 8)}`,
              type: 'ASSET',
              category: 'CASH',
              ownerType: 'USER',
              ownerId: userId,
              walletId: newWallet.id,
              description: `Wallet account for user ${userId}`,
              isSystem: false,
              isActive: true,
              balance: 0,
              pendingBalance: 0,
            },
          });

          // Update wallet with ledger account reference
          await tx.wallet.update({
            where: { id: newWallet.id },
            data: { ledgerAccountId: ledgerAccount.id },
          });

          this.logger.log(`Wallet created for user: ${userId} with ledger account: ${ledgerAccount.id}`);
        });

        // Log activity
        await this.prisma.activityLog.create({
          data: {
            userId,
            activity: 'WALLET_AUTO_CREATED',
            details: JSON.stringify({
              userId,
              timestamp: new Date().toISOString(),
              reason: 'Auto-created on first access',
            }),
          },
        });
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to ensure wallet for user ${userId}: ${error.message}`);
      // Don't block the request if wallet creation fails
      return true;
    }
  }
}