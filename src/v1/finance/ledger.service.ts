import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  // System Account Codes
  private readonly SYSTEM_ACCOUNTS = {
    // Asset Accounts
    PLATFORM_FEE_ACCOUNT: { code: '4100', name: 'Platform Service Fees' },
    PLATFORM_REVENUE_ACCOUNT: { code: '4000', name: 'Platform Revenue' },
    ESCROW_ACCOUNT: { code: '2100', name: 'Platform Escrow Account' },
    BANK_CLEARING_ACCOUNT: { code: '1100', name: 'Bank Clearing Account' },
    VAT_PAYABLE_ACCOUNT: { code: '2200', name: 'VAT Payable' },
    PAYSTACK_SETTLEMENT_ACCOUNT: {
      code: '1200',
      name: 'Paystack Settlement Account',
    },
    PAYSTACK_FEE_ACCOUNT: { code: '4200', name: 'Paystack Transaction Fees' },
    // Liability Accounts
    SETTLEMENT_PAYABLE_ACCOUNT: { code: '2300', name: 'Settlement Payable' },
  };

  // VAT Rate (Nigeria)
  private readonly VAT_RATE = 0.075; // 7.5%

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // LEDGER ACCOUNT MANAGEMENT
  // ============================================

  async createLedgerAccount(data: {
    code: string;
    name: string;
    type: string;
    category: string;
    ownerType: string;
    ownerId?: string;
    walletId?: string;
    parentId?: string;
    description?: string;
    isSystem?: boolean;
    createdBy?: string;
    metadata?: any;
  }) {
    this.logger.log(`Creating ledger account: ${data.code} - ${data.name}`);

    const existing = await this.prisma.ledgerAccount.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new BadRequestException(
        `Ledger account with code ${data.code} already exists`,
      );
    }

    const account = await this.prisma.ledgerAccount.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type as any,
        category: data.category as any,
        ownerType: data.ownerType as any,
        ownerId: data.ownerId,
        walletId: data.walletId,
        parentId: data.parentId,
        description: data.description,
        isSystem: data.isSystem || false,
        createdBy: data.createdBy,
        metadata: data.metadata,
        balance: 0,
        pendingBalance: 0,
        isActive: true,
      },
    });

    this.logger.log(`Ledger account created: ${account.id}`);
    return account;
  }

  async getLedgerAccounts(filters?: {
    type?: string;
    ownerType?: string;
    ownerId?: string;
    isActive?: boolean;
  }) {
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.ownerType) where.ownerType = filters.ownerType;
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.ledgerAccount.findMany({
      where,
      include: {
        parent: true,
        children: true,
        wallet: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  async getLedgerAccountById(id: string) {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        wallet: true,
        journalLines: {
          include: {
            journalEntry: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    return account;
  }

  async getLedgerAccountBalance(id: string) {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { id },
      select: { balance: true, pendingBalance: true },
    });

    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    return {
      balance: account.balance,
      pendingBalance: account.pendingBalance,
    };
  }

  // ============================================
  // SYSTEM ACCOUNT MANAGEMENT
  // ============================================

  private async getOrCreateSystemAccount(config: {
    code: string;
    name: string;
    type: string;
    category: string;
    description?: string;
    metadata?: any;
  }) {
    let account = await this.prisma.ledgerAccount.findUnique({
      where: { code: config.code },
    });

    if (!account) {
      account = await this.prisma.ledgerAccount.create({
        data: {
          code: config.code,
          name: config.name,
          type: config.type as any,
          category: config.category as any,
          ownerType: 'PLATFORM',
          description: config.description,
          isSystem: true,
          isActive: true,
          balance: 0,
          pendingBalance: 0,
          metadata: config.metadata,
        },
      });
      this.logger.log(
        `Created system account: ${config.code} - ${config.name}`,
      );
    }

    return account;
  }

  async getOrCreatePlatformFeeAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.PLATFORM_FEE_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.PLATFORM_FEE_ACCOUNT.name,
      type: 'REVENUE',
      category: 'PLATFORM_FEE',
      description: 'Platform service fee revenue account',
    });
  }

  async getOrCreatePlatformRevenueAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.PLATFORM_REVENUE_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.PLATFORM_REVENUE_ACCOUNT.name,
      type: 'REVENUE',
      category: 'REVENUE',
      description: 'Platform revenue account',
    });
  }

  async getOrCreateEscrowAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.ESCROW_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.ESCROW_ACCOUNT.name,
      type: 'ASSET',
      category: 'ESCROW',
      description: 'Holds customer funds pending settlement',
    });
  }

  async getOrCreateBankClearingAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.BANK_CLEARING_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.BANK_CLEARING_ACCOUNT.name,
      type: 'ASSET',
      category: 'BANK',
      description: 'Tracks in-transit bank settlements',
    });
  }

  async getOrCreateVatPayableAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.VAT_PAYABLE_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.VAT_PAYABLE_ACCOUNT.name,
      type: 'LIABILITY',
      category: 'PAYABLE',
      description: 'VAT owed to government',
    });
  }

  async getOrCreatePaystackSettlementAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.PAYSTACK_SETTLEMENT_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.PAYSTACK_SETTLEMENT_ACCOUNT.name,
      type: 'ASSET',
      category: 'BANK',
      description: 'Paystack settlement account',
    });
  }

  async getOrCreatePaystackFeeAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.PAYSTACK_FEE_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.PAYSTACK_FEE_ACCOUNT.name,
      type: 'EXPENSE',
      category: 'EXPENSE',
      description: 'Paystack transaction fees',
    });
  }

  async getOrCreateSettlementPayableAccount() {
    return this.getOrCreateSystemAccount({
      code: this.SYSTEM_ACCOUNTS.SETTLEMENT_PAYABLE_ACCOUNT.code,
      name: this.SYSTEM_ACCOUNTS.SETTLEMENT_PAYABLE_ACCOUNT.name,
      type: 'LIABILITY',
      category: 'PAYABLE',
      description: 'Settlement payable to organizations',
    });
  }

  // ============================================
  // WALLET LEDGER ACCOUNT
  // ============================================

  async getOrCreateWalletLedgerAccount(
    walletId: string,
    userId?: string,
    organizationId?: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    let account = await this.prisma.ledgerAccount.findUnique({
      where: { walletId },
    });

    if (!account) {
      const ownerType = userId
        ? 'USER'
        : organizationId
          ? 'ORGANIZATION'
          : 'SYSTEM';
      const ownerId = userId || organizationId;
      const name = `${ownerType} Wallet - ${walletId.substring(0, 8)}`;

      account = await this.prisma.ledgerAccount.create({
        data: {
          code: `WALLET-${walletId.substring(0, 8)}`,
          name,
          type: 'ASSET',
          category: 'CASH',
          ownerType: ownerType as any,
          ownerId,
          walletId,
          description: `Wallet account for ${ownerType.toLowerCase()}`,
          isSystem: false,
          isActive: true,
          balance: 0,
          pendingBalance: 0,
        },
      });

      // Update wallet with ledger account reference
      await this.prisma.wallet.update({
        where: { id: walletId },
        data: { ledgerAccountId: account.id },
      });
    }

    return account;
  }

  // ============================================
  // CALCULATE PAYMENT CHARGES (CHARGES ADDED ON TOP)
  // ============================================

  calculatePaymentCharges(amount: number): {
    platformFee: number;
    paystackFee: number;
    vat: number;
    totalCharges: number;
    totalAmount: number;
    netToOrganization: number;
  } {
    // Organization gets the full amount (₦5,000)
    const netToOrganization = amount;

    // Platform fee: 2% of amount (₦100)
    const platformFee = Math.round(amount * 0.02);

    // Paystack fee: 1.5% + ₦100 (₦175)
    const paystackFee = Math.round(amount * 0.015) + 100;

    // VAT: 7.5% of platform fee (₦7.50)
    const vat = Math.round(platformFee * this.VAT_RATE);

    // Total charges added on top
    const totalCharges = platformFee + paystackFee + vat;

    // Student pays: amount + charges (₦5,000 + ₦282.50 = ₦5,282.50)
    const totalAmount = amount + totalCharges;

    return {
      platformFee,
      paystackFee,
      vat,
      totalCharges,
      totalAmount,
      netToOrganization,
    };
  }

  // ============================================
  // JOURNAL ENTRY MANAGEMENT
  // ============================================

  async createJournalEntry(data: {
    lines: Array<{
      accountId: string;
      type: 'DEBIT' | 'CREDIT';
      amount: number;
      description?: string;
    }>;
    description?: string;
    transactionId?: string;
    paymentId?: string;
    withdrawalId?: string;
    refundId?: string;
    createdBy?: string;
  }) {
    this.logger.log(`Creating journal entry with ${data.lines.length} lines`);

    // Validate: Total debits must equal total credits
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of data.lines) {
      if (line.type === 'DEBIT') {
        totalDebits += line.amount;
      } else {
        totalCredits += line.amount;
      }
    }

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(
        `Journal entry must be balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`,
      );
    }

    // Generate reference
    const reference = `JE-${new Date().getFullYear()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Create journal entry with lines in a transaction
    const journalEntry = await this.prisma.$transaction(async (tx) => {
      // Create the journal entry
      const entry = await tx.journalEntry.create({
        data: {
          reference,
          description: data.description,
          transactionId: data.transactionId,
          paymentId: data.paymentId,
          withdrawalId: data.withdrawalId,
          refundId: data.refundId,
          entryDate: new Date(),
          status: 'POSTED',
          isBalanced: true,
          createdBy: data.createdBy,
        },
      });

      // Create journal lines and update account balances
      for (const line of data.lines) {
        // Get account to verify it exists
        const account = await tx.ledgerAccount.findUnique({
          where: { id: line.accountId },
        });

        if (!account) {
          throw new NotFoundException(
            `Ledger account ${line.accountId} not found`,
          );
        }

        // Create the journal line
        await tx.journalLine.create({
          data: {
            journalEntryId: entry.id,
            ledgerAccountId: line.accountId,
            type: line.type as any,
            amount: line.amount,
            description: line.description,
          },
        });

        // Update the ledger account balance
        const balanceChange =
          line.type === 'DEBIT' ? line.amount : -line.amount;
        await tx.ledgerAccount.update({
          where: { id: line.accountId },
          data: {
            balance: account.balance + balanceChange,
          },
        });
      }

      return entry;
    });

    this.logger.log(`Journal entry created: ${journalEntry.reference}`);
    return journalEntry;
  }

  async getJournalEntries(filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    transactionId?: string;
    paymentId?: string;
  }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.transactionId) where.transactionId = filters.transactionId;
    if (filters?.paymentId) where.paymentId = filters.paymentId;
    if (filters?.startDate)
      where.entryDate = { ...where.entryDate, gte: filters.startDate };
    if (filters?.endDate)
      where.entryDate = { ...where.entryDate, lte: filters.endDate };

    return this.prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: {
            ledgerAccount: true,
          },
        },
        transaction: true,
        payment: true,
        withdrawal: true,
        refund: true,
      },
      orderBy: { entryDate: 'desc' },
    });
  }

  async getJournalEntryById(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            ledgerAccount: true,
          },
        },
        transaction: true,
        payment: true,
        withdrawal: true,
        refund: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    return entry;
  }

  async reverseJournalEntry(id: string, reason: string, reversedBy?: string) {
    this.logger.log(`Reversing journal entry: ${id}`);

    const originalEntry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            ledgerAccount: true,
          },
        },
      },
    });

    if (!originalEntry) {
      throw new NotFoundException('Journal entry not found');
    }

    if (originalEntry.status === 'REVERSED') {
      throw new BadRequestException('Journal entry is already reversed');
    }

    // Create reversal journal entry
    const reversalLines = originalEntry.lines.map((line) => ({
      accountId: line.ledgerAccountId,
      type: line.type === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
      amount: line.amount,
      description: `Reversal of ${originalEntry.reference}: ${line.description || ''}`,
    }));

    const reversal = await this.createJournalEntry({
      lines: reversalLines,
      description: `Reversal of ${originalEntry.reference}: ${reason}`,
      createdBy: reversedBy,
    });

    // Mark original as reversed
    await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'REVERSED',
        notes: `Reversed by ${reversedBy || 'system'}: ${reason}`,
      },
    });

    this.logger.log(`Journal entry reversed: ${id}`);
    return reversal;
  }

  // ============================================
  // RECONCILIATION
  // ============================================

  async reconcileAccounts(startDate: Date, endDate: Date) {
    this.logger.log(`Reconciling accounts from ${startDate} to ${endDate}`);

    // Get all journal entries in date range
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        entryDate: {
          gte: startDate,
          lte: endDate,
        },
        status: 'POSTED',
      },
      include: {
        lines: true,
      },
    });

    // Group by account
    const accountBalances: Record<string, number> = {};

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (!accountBalances[line.ledgerAccountId]) {
          accountBalances[line.ledgerAccountId] = 0;
        }

        const amount = line.type === 'DEBIT' ? line.amount : -line.amount;
        accountBalances[line.ledgerAccountId] += amount;
      }
    }

    // Get account details
    const accountIds = Object.keys(accountBalances);
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
    });

    const reconciliation = accounts.map((account) => ({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      currentBalance: account.balance,
      calculatedBalance: accountBalances[account.id] || 0,
      difference: account.balance - (accountBalances[account.id] || 0),
      isReconciled: account.balance === (accountBalances[account.id] || 0),
    }));

    return {
      startDate,
      endDate,
      totalEntries: entries.length,
      accounts: reconciliation,
      isBalanced: reconciliation.every((a) => a.isReconciled),
    };
  }
}
