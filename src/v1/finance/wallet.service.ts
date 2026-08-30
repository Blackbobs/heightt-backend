// src/v1/finance/wallet.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EventService, SystemEvents } from '../../events/event.service';
import { LedgerService } from './ledger.service';

export type WalletOwner =
  | { type: 'USER'; id: string }
  | { type: 'ORGANIZATION'; id: string }
  | { type: 'PLATFORM' };

@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);
  private platformWalletId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly eventService: EventService,
    private readonly ledgerService: LedgerService,
  ) {}

  async onModuleInit() {
    try {
      await this.initializePlatformWallet();
    } catch (error) {
      if (error.message?.includes('does not exist in the current database')) {
        this.logger.warn(
          'Wallet tables do not exist yet. Please run migrations: npx prisma migrate dev',
        );
        this.logger.warn(
          'Platform wallet will be initialized after migrations are run.',
        );
      } else {
        this.logger.error(
          `Failed to initialize platform wallet: ${error.message}`,
        );
      }
    }
  }

  /**
   * Initialize the platform wallet - called ONCE on app startup
   * Only ONE platform wallet exists in the entire system
   */
  private async initializePlatformWallet() {
    this.logger.log('Initializing platform wallet...');

    // Check for existing platform wallet
    const existingWallet = await this.prisma.wallet.findFirst({
      where: {
        isPlatformWallet: true,
      },
      include: { ledgerAccount: true },
    });

    if (existingWallet) {
      this.logger.log('Platform wallet already exists');
      this.platformWalletId = existingWallet.id;
      return existingWallet;
    }

    // Check for legacy wallet (userId: null, organizationId: null)
    // This handles the case where a wallet was created without isPlatformWallet flag
    const legacyWallet = await this.prisma.wallet.findFirst({
      where: {
        userId: null,
        organizationId: null,
        isPlatformWallet: false,
      },
      include: { ledgerAccount: true },
    });

    if (legacyWallet) {
      this.logger.log('Converting legacy wallet to platform wallet');
      const updated = await this.prisma.wallet.update({
        where: { id: legacyWallet.id },
        data: {
          isPlatformWallet: true,
        },
        include: { ledgerAccount: true },
      });
      this.platformWalletId = updated.id;
      return updated;
    }

    // Create new platform wallet (only if none exists)
    const wallet = await this.prisma.$transaction(async (tx) => {
      const newWallet = await tx.wallet.create({
        data: {
          currency: 'NGN',
          balance: 0,
          heldBalance: 0,
          status: 'ACTIVE',
          isPlatformWallet: true,
        },
      });

      const ledgerAccount = await tx.ledgerAccount.create({
        data: {
          code: `PLATFORM-WALLET-${newWallet.id.substring(0, 8)}`,
          name: 'Platform Wallet',
          type: 'ASSET',
          category: 'CASH',
          ownerType: 'PLATFORM',
          walletId: newWallet.id,
          description: 'Platform wallet for system funds',
          isSystem: true,
          isActive: true,
          balance: 0,
          pendingBalance: 0,
        },
      });

      await tx.wallet.update({
        where: { id: newWallet.id },
        data: { ledgerAccountId: ledgerAccount.id },
      });

      await tx.activityLog.create({
        data: {
          activity: 'PLATFORM_WALLET_INITIALIZED',
          details: JSON.stringify({
            walletId: newWallet.id,
            ledgerAccountId: ledgerAccount.id,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return tx.wallet.findUnique({
        where: { id: newWallet.id },
        include: { ledgerAccount: true },
      });
    });

    if (wallet) {
      this.platformWalletId = wallet.id;
      this.logger.log(`Platform wallet initialized: ${wallet.id}`);
    }

    return wallet;
  }

  /**
   * Get or create a wallet for any owner type
   * This is the SINGLE source of truth for wallet creation
   */
  async getOrCreateWallet(owner: WalletOwner): Promise<any> {
    this.logger.log(`Getting/Creating wallet for: ${JSON.stringify(owner)}`);

    let wallet: any;

    switch (owner.type) {
      case 'USER':
        wallet = await this.getOrCreateUserWallet(owner.id);
        break;
      case 'ORGANIZATION':
        wallet = await this.getOrCreateOrganizationWallet(owner.id);
        break;
      case 'PLATFORM':
        wallet = await this.getOrCreatePlatformWallet();
        break;
      default:
        throw new BadRequestException('Invalid wallet owner type');
    }

    if (wallet) {
      await this.cacheWallet(wallet);
    }

    return wallet;
  }

  /**
   * Get or create a user wallet
   * Each user has exactly ONE wallet
   */
  private async getOrCreateUserWallet(userId: string): Promise<any> {
    const cached = await this.cacheService.get(`wallet:user:${userId}`);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { ledgerAccount: true },
    });

    if (!wallet) {
      wallet = await this.prisma.$transaction(async (tx) => {
        const newWallet = await tx.wallet.create({
          data: {
            userId,
            currency: 'NGN',
            balance: 0,
            heldBalance: 0,
            status: 'ACTIVE',
            isPlatformWallet: false,
          },
        });

        const ledgerAccount = await tx.ledgerAccount.create({
          data: {
            code: `WALLET-USER-${newWallet.id.substring(0, 8)}`,
            name: `User Wallet - ${user.username || userId.substring(0, 8)}`,
            type: 'ASSET',
            category: 'CASH',
            ownerType: 'USER',
            ownerId: userId,
            walletId: newWallet.id,
            description: `Wallet for user ${userId}`,
            isSystem: false,
            isActive: true,
            balance: 0,
            pendingBalance: 0,
          },
        });

        await tx.wallet.update({
          where: { id: newWallet.id },
          data: { ledgerAccountId: ledgerAccount.id },
        });

        await tx.activityLog.create({
          data: {
            userId,
            activity: 'WALLET_CREATED',
            details: JSON.stringify({
              walletId: newWallet.id,
              ledgerAccountId: ledgerAccount.id,
              ownerType: 'USER',
              ownerId: userId,
            }),
          },
        });

        this.eventService.emit(SystemEvents.WALLET_CREATED, {
          walletId: newWallet.id,
          userId,
          type: 'USER',
        });

        return tx.wallet.findUnique({
          where: { id: newWallet.id },
          include: { ledgerAccount: true },
        });
      });

      if (wallet) {
        this.logger.log(`Created new user wallet for: ${userId}`);
      }
    }

    return wallet;
  }

  /**
   * Get or create an organization wallet
   * Each organization has exactly ONE wallet
   * This is called when organizations are created (institution, faculty, department, level)
   */
  private async getOrCreateOrganizationWallet(
    organizationId: string,
  ): Promise<any> {
    const cached = await this.cacheService.get(
      `wallet:organization:${organizationId}`,
    );
    if (cached) {
      return cached;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    let wallet = await this.prisma.wallet.findUnique({
      where: { organizationId },
      include: { ledgerAccount: true },
    });

    if (!wallet) {
      wallet = await this.prisma.$transaction(async (tx) => {
        const newWallet = await tx.wallet.create({
          data: {
            organizationId,
            currency: 'NGN',
            balance: 0,
            heldBalance: 0,
            status: 'ACTIVE',
            isPlatformWallet: false,
          },
        });

        const ledgerAccount = await tx.ledgerAccount.create({
          data: {
            code: `WALLET-ORG-${newWallet.id.substring(0, 8)}`,
            name: `Organization Wallet - ${organization.name || organizationId.substring(0, 8)}`,
            type: 'ASSET',
            category: 'CASH',
            ownerType: 'ORGANIZATION',
            ownerId: organizationId,
            walletId: newWallet.id,
            description: `Wallet for organization ${organizationId}`,
            isSystem: false,
            isActive: true,
            balance: 0,
            pendingBalance: 0,
          },
        });

        await tx.wallet.update({
          where: { id: newWallet.id },
          data: { ledgerAccountId: ledgerAccount.id },
        });

        await tx.activityLog.create({
          data: {
            activity: 'WALLET_CREATED',
            details: JSON.stringify({
              walletId: newWallet.id,
              ledgerAccountId: ledgerAccount.id,
              ownerType: 'ORGANIZATION',
              ownerId: organizationId,
            }),
          },
        });

        this.eventService.emit(SystemEvents.WALLET_CREATED, {
          walletId: newWallet.id,
          organizationId,
          type: 'ORGANIZATION',
        });

        return tx.wallet.findUnique({
          where: { id: newWallet.id },
          include: { ledgerAccount: true },
        });
      });

      if (wallet) {
        this.logger.log(
          `Created new organization wallet for: ${organizationId}`,
        );
      }
    }

    return wallet;
  }

  /**
   * Get or create the platform wallet
   * Returns the SINGLE platform wallet for the entire system
   */
  async getOrCreatePlatformWallet(): Promise<any> {
    const cached = await this.cacheService.get('wallet:platform');
    if (cached) {
      return cached;
    }

    let wallet = await this.prisma.wallet.findFirst({
      where: {
        isPlatformWallet: true,
      },
      include: { ledgerAccount: true },
    });

    if (!wallet) {
      wallet = await this.initializePlatformWallet();
    }

    if (wallet) {
      await this.cacheService.setWithTag(
        'wallet:platform',
        wallet,
        ['finance', 'wallet', 'platform'],
        300,
      );
    }

    return wallet;
  }

  private async cacheWallet(wallet: any): Promise<void> {
    if (!wallet) return;

    const tags = ['finance', 'wallet'];

    if (wallet.userId) {
      await this.cacheService.setWithTag(
        `wallet:user:${wallet.userId}`,
        wallet,
        tags,
        300,
      );
    }

    if (wallet.organizationId) {
      await this.cacheService.setWithTag(
        `wallet:organization:${wallet.organizationId}`,
        wallet,
        tags,
        300,
      );
    }

    if (wallet.isPlatformWallet) {
      await this.cacheService.setWithTag('wallet:platform', wallet, tags, 300);
    }
  }

  async invalidateWalletCache(owner: WalletOwner): Promise<void> {
    switch (owner.type) {
      case 'USER':
        await this.cacheService.delete(`wallet:user:${owner.id}`);
        await this.cacheService.invalidateByTag(`user:${owner.id}`);
        break;
      case 'ORGANIZATION':
        await this.cacheService.delete(`wallet:organization:${owner.id}`);
        await this.cacheService.invalidateByTag(`organization:${owner.id}`);
        break;
      case 'PLATFORM':
        await this.cacheService.delete('wallet:platform');
        break;
    }

    await this.cacheService.invalidateByTag('wallet');
    await this.cacheService.invalidateByTag('finance');
  }

  async getBalance(owner: WalletOwner): Promise<{
    balance: number;
    heldBalance: number;
    currency: string;
    availableBalance: number;
  }> {
    const wallet = await this.getOrCreateWallet(owner);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      balance: wallet.balance,
      heldBalance: wallet.heldBalance,
      currency: wallet.currency,
      availableBalance: wallet.balance - wallet.heldBalance,
    };
  }

  async hasSufficientBalance(
    owner: WalletOwner,
    amount: number,
    includeHeldBalance: boolean = true,
  ): Promise<boolean> {
    const wallet = await this.getOrCreateWallet(owner);

    if (!wallet) {
      return false;
    }

    const availableBalance = includeHeldBalance
      ? wallet.balance - wallet.heldBalance
      : wallet.balance;

    return availableBalance >= amount;
  }

  /**
   * For backward compatibility - creates a wallet for any owner
   */
  async createWalletForOwner(data: {
    userId?: string;
    organizationId?: string;
  }): Promise<any> {
    if (data.userId) {
      return this.getOrCreateWallet({ type: 'USER', id: data.userId });
    } else if (data.organizationId) {
      return this.getOrCreateWallet({
        type: 'ORGANIZATION',
        id: data.organizationId,
      });
    } else {
      throw new BadRequestException(
        'Either userId or organizationId is required',
      );
    }
  }
}