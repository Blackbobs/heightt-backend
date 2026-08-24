// src/v1/finance/bank-account.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async createBankAccount(userId: string, dto: CreateBankAccountDto) {
    this.logger.log(`Creating bank account for user: ${userId}`);

    const existing = await this.prisma.bankAccount.findFirst({
      where: {
        userId,
        accountNumber: dto.accountNumber,
        bankName: dto.bankName,
      },
    });

    if (existing) {
      throw new ConflictException('This bank account is already added');
    }

    const count = await this.prisma.bankAccount.count({ where: { userId } });
    const isDefault = dto.isDefault || count === 0;

    if (isDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const bankAccount = await this.prisma.bankAccount.create({
      data: {
        userId,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        bankCode: dto.bankCode,
        isDefault,
      },
    });

    await this.cacheService.delete(`bank-accounts:user:${userId}`);
    this.logger.log(`Bank account created: ${bankAccount.id}`);
    return bankAccount;
  }

  async getUserBankAccounts(userId: string) {
    const cacheKey = `bank-accounts:user:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const accounts = await this.prisma.bankAccount.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });

    await this.cacheService.set(cacheKey, accounts, 300);
    return accounts;
  }

  async getBankAccountById(id: string, userId: string) {
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    if (bankAccount.userId !== userId) {
      throw new BadRequestException(
        'You do not have access to this bank account',
      );
    }

    return bankAccount;
  }

  async updateBankAccount(
    id: string,
    userId: string,
    dto: UpdateBankAccountDto,
  ) {
    const bankAccount = await this.getBankAccountById(id, userId);

    if (dto.isDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        bankCode: dto.bankCode,
        isDefault: dto.isDefault,
      },
    });

    await this.cacheService.delete(`bank-accounts:user:${userId}`);
    return updated;
  }

  async deleteBankAccount(id: string, userId: string) {
    const bankAccount = await this.getBankAccountById(id, userId);

    if (bankAccount.isDefault) {
      const nextAccount = await this.prisma.bankAccount.findFirst({
        where: { userId, NOT: { id } },
      });

      if (nextAccount) {
        await this.prisma.bankAccount.update({
          where: { id: nextAccount.id },
          data: { isDefault: true },
        });
      }
    }

    await this.prisma.bankAccount.delete({
      where: { id },
    });

    await this.cacheService.delete(`bank-accounts:user:${userId}`);
    return { message: 'Bank account deleted successfully' };
  }

  async setDefaultBankAccount(id: string, userId: string) {
    await this.getBankAccountById(id, userId);

    await this.prisma.bankAccount.updateMany({
      where: { userId, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });

    await this.prisma.bankAccount.update({
      where: { id },
      data: { isDefault: true },
    });

    await this.cacheService.delete(`bank-accounts:user:${userId}`);
    return { message: 'Default bank account updated' };
  }
}
