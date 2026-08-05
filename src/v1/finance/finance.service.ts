// src/v1/finance/finance.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { PermissionService } from '../auth/permission.service';
import { EmailService } from '../../email/email.service';
import { LedgerService } from './ledger.service';
import { ReceiptService } from './receipt.service';
import { EventService, SystemEvents } from '../../events/event.service';
import {
  CreateWalletDto,
  CreditWalletDto,
  DebitWalletDto,
  CreateDueDto,
  AssignDueDto,
  CreatePaymentDto,
  CreateManualPaymentDto,
  WithdrawalRequestDto,
  CreateSavingsGoalDto,
  SavingsDepositDto,
} from './dto';
import { randomBytes } from 'crypto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  // 1 NGN = 100 Kobo
  private readonly KOBO_PER_NAIRA = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly permissionService: PermissionService,
    private readonly emailService: EmailService,
    private readonly ledgerService: LedgerService,
    private readonly receiptService: ReceiptService,
    private readonly eventService: EventService,
  ) {}

  // ============================================
  // WALLET MANAGEMENT
  // ============================================

  async createWallet(userId: string, dto: CreateWalletDto) {
    this.logger.log(
      `Creating wallet for user: ${dto.userId || dto.organizationId}`,
    );

    if (!dto.userId && !dto.organizationId) {
      throw new BadRequestException(
        'Either userId or organizationId is required',
      );
    }

    if (dto.userId) {
      const existing = await this.prisma.wallet.findUnique({
        where: { userId: dto.userId },
      });
      if (existing) {
        throw new ConflictException('User already has a wallet');
      }
    }

    if (dto.organizationId) {
      const existing = await this.prisma.wallet.findUnique({
        where: { organizationId: dto.organizationId },
      });
      if (existing) {
        throw new ConflictException('Organization already has a wallet');
      }
    }

    const wallet = await this.prisma.wallet.create({
      data: {
        userId: dto.userId,
        organizationId: dto.organizationId,
        currency: dto.currency || 'NGN',
        balance: 0,
        heldBalance: 0,
        status: 'ACTIVE',
      },
    });

    const ledgerAccount =
      await this.ledgerService.getOrCreateWalletLedgerAccount(
        wallet.id,
        dto.userId,
        dto.organizationId,
      );

    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { ledgerAccountId: ledgerAccount.id },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'WALLET_CREATED',
        details: JSON.stringify({
          walletId: wallet.id,
          ledgerAccountId: ledgerAccount.id,
          userId: dto.userId,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.eventService.emit(SystemEvents.WALLET_CREATED, {
      walletId: wallet.id,
      userId: dto.userId || userId,
      organizationId: dto.organizationId,
      currency: dto.currency || 'NGN',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Wallet created: ${wallet.id} with ledger account: ${ledgerAccount.id}`,
    );
    return wallet;
  }

  async getWalletByUserId(userId: string) {
    const cacheKey = `wallet:user:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        holds: {
          where: { status: 'ACTIVE' },
        },
        ledgerAccount: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    await this.cacheService.set(cacheKey, wallet, 300);
    return wallet;
  }

  async getWalletByOrganizationId(organizationId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { organizationId },
      include: {
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        holds: {
          where: { status: 'ACTIVE' },
        },
        ledgerAccount: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Organization wallet not found');
    }

    return wallet;
  }

  // ============================================
  // WALLET TRANSACTIONS (WITH ROW LOCKING)
  // ============================================

  async creditWallet(userId: string, dto: CreditWalletDto) {
    this.logger.log(
      `Crediting wallet for user: ${userId} - Amount: ${dto.amount} Kobo`,
    );

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: dto.userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + dto.amount;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: 'COMPLETED',
          reference:
            dto.reference ||
            `TXN_${randomBytes(16).toString('hex').toUpperCase()}`,
          description: dto.description || 'Wallet credit',
          completedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: wallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: dto.amount,
          type: 'CREDIT',
          balanceBefore,
          balanceAfter,
          description: dto.description || 'Wallet credit',
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: balanceAfter },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'WALLET_CREDITED',
          details: JSON.stringify({
            walletId: wallet.id,
            amount: dto.amount,
            balanceAfter,
            reference: transaction.reference,
          }),
        },
      });

      this.eventService.emitWalletCredited({
        walletId: wallet.id,
        userId: dto.userId,
        amount: dto.amount,
        balance: balanceAfter,
        previousBalance: balanceBefore,
        reference: transaction.reference,
        description: dto.description || 'Wallet credit',
      });

      await this.cacheService.delete(`wallet:user:${dto.userId}`);

      this.logger.log(
        `Wallet credited: ${wallet.id}, amount: ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );
      return {
        wallet: updatedWallet,
        transaction,
      };
    });
  }

  async debitWallet(userId: string, dto: DebitWalletDto) {
    this.logger.log(
      `Debiting wallet for user: ${userId} - Amount: ${dto.amount} Kobo`,
    );

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: dto.userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      if (wallet.balance < dto.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - dto.amount;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: 'COMPLETED',
          reference:
            dto.reference ||
            `TXN_${randomBytes(16).toString('hex').toUpperCase()}`,
          description: dto.description || 'Wallet debit',
          completedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: wallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: dto.amount,
          type: 'DEBIT',
          balanceBefore,
          balanceAfter,
          description: dto.description || 'Wallet debit',
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: balanceAfter },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'WALLET_DEBITED',
          details: JSON.stringify({
            walletId: wallet.id,
            amount: dto.amount,
            balanceAfter,
            reference: transaction.reference,
          }),
        },
      });

      this.eventService.emitWalletDebited({
        walletId: wallet.id,
        userId: dto.userId,
        amount: dto.amount,
        balance: balanceAfter,
        previousBalance: balanceBefore,
        reference: transaction.reference,
        description: dto.description || 'Wallet debit',
      });

      await this.cacheService.delete(`wallet:user:${dto.userId}`);

      this.logger.log(
        `Wallet debited: ${wallet.id}, amount: ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );
      return {
        wallet: updatedWallet,
        transaction,
      };
    });
  }

  // ============================================
  // TRANSACTIONS
  // ============================================

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      type?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const skip = (page - 1) * limit;
    const where: any = { walletId: wallet.id };

    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.startDate) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(filters.startDate),
      };
    }
    if (filters?.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          payment: true,
          settlement: true,
          journalEntry: {
            include: {
              lines: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // DUE MANAGEMENT
  // ============================================

  async createDue(userId: string, dto: CreateDueDto) {
    this.logger.log(`Creating due: ${dto.name} - Amount: ${dto.amount} Kobo`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const due = await this.prisma.due.create({
      data: {
        organizationId: dto.organizationId,
        sessionId: dto.sessionId,
        name: dto.name,
        description: dto.description,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        lateFee: dto.lateFee || 0,
        isRequired: dto.isRequired !== undefined ? dto.isRequired : true,
        status: 'ACTIVE',
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DUE_CREATED',
        details: JSON.stringify({
          dueId: due.id,
          name: due.name,
          amount: due.amount,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.logger.log(`Due created: ${due.id}`);
    return due;
  }

  async assignDueToStudents(userId: string, dueId: string, dto: AssignDueDto) {
    this.logger.log(`Assigning due ${dueId} to students`);

    const due = await this.prisma.due.findUnique({
      where: { id: dueId },
    });
    if (!due) {
      throw new NotFoundException('Due not found');
    }

    let studentIds = dto.studentIds || [];

    if (dto.departmentId) {
      const students = await this.prisma.studentProfile.findMany({
        where: { departmentId: dto.departmentId },
        select: { id: true },
      });
      studentIds = [...studentIds, ...students.map((s) => s.id)];
    }

    if (dto.levelId) {
      const students = await this.prisma.studentProfile.findMany({
        where: { currentAcademicLevelId: dto.levelId },
        select: { id: true },
      });
      studentIds = [...studentIds, ...students.map((s) => s.id)];
    }

    studentIds = [...new Set(studentIds)];

    if (studentIds.length === 0) {
      throw new BadRequestException('No students found to assign due');
    }

    const createdAssignments: any[] = [];
    for (const studentId of studentIds) {
      const existing = await this.prisma.dueAssignment.findUnique({
        where: {
          dueId_studentId: {
            dueId,
            studentId,
          },
        },
      });

      if (!existing) {
        const assignment = await this.prisma.dueAssignment.create({
          data: {
            dueId,
            studentId,
            amount: due.amount,
            isPaid: false,
          },
        });
        createdAssignments.push(assignment);
      }
    }

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DUE_ASSIGNED',
        details: JSON.stringify({
          dueId,
          studentCount: createdAssignments.length,
          departmentId: dto.departmentId,
          levelId: dto.levelId,
        }),
      },
    });

    // Get the organization ID from the due with null check
    const dueWithOrg = await this.prisma.due.findUnique({
      where: { id: dueId },
      select: { organizationId: true },
    });

    // Emit dues assigned event - only if dueWithOrg exists
    if (dueWithOrg) {
      for (const assignment of createdAssignments) {
        this.eventService.emitDuesAssigned({
          dueId: dueId,
          organizationId: dueWithOrg.organizationId,
          studentId: assignment.studentId,
          amount: due.amount,
          dueDate: due.dueDate,
        });
      }
    }

    this.logger.log(`Due assigned to ${createdAssignments.length} students`);
    return {
      message: `Due assigned to ${createdAssignments.length} students`,
      count: createdAssignments.length,
    };
  }

  async getDues(organizationId?: string, page: number = 1, limit: number = 10) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const skip = (page - 1) * limit;
    const [dues, total] = await Promise.all([
      this.prisma.due.findMany({
        where,
        skip,
        take: limit,
        include: {
          organization: true,
          session: true,
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.due.count({ where }),
    ]);

    const duesWithCounts = await Promise.all(
      dues.map(async (due) => {
        const pendingCount = await this.prisma.dueAssignment.count({
          where: {
            dueId: due.id,
            isPaid: false,
          },
        });
        return {
          ...due,
          pendingAssignments: pendingCount,
        };
      }),
    );

    return {
      data: duesWithCounts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStudentDues(studentId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const assignments = await this.prisma.dueAssignment.findMany({
      where: { studentId },
      include: {
        due: {
          include: {
            organization: true,
            session: true,
          },
        },
      },
      orderBy: { due: { dueDate: 'asc' } },
    });

    const assignmentsWithPayments = await Promise.all(
      assignments.map(async (assignment) => {
        const payments = await this.prisma.duePayment.findMany({
          where: { assignmentId: assignment.id },
          include: { payment: true },
        });
        return {
          ...assignment,
          payments,
        };
      }),
    );

    return assignmentsWithPayments;
  }

  // ============================================
  // PAYMENT PROCESSING (WITH CHARGES ADDED ON TOP)
  // ============================================

  async processPayment(userId: string, dto: CreatePaymentDto) {
    this.logger.log(
      `Processing payment for user: ${userId} - Amount: ${dto.amount} Kobo`,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        include: { ledgerAccount: true },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      const charges = this.ledgerService.calculatePaymentCharges(dto.amount);
      const totalAmount = charges.totalAmount;

      this.logger.log(
        `Charges breakdown: Amount: ${dto.amount}, Platform Fee: ${charges.platformFee}, Paystack Fee: ${charges.paystackFee}, VAT: ${charges.vat}, Total Charges: ${charges.totalCharges}, Total Student Pays: ${totalAmount}`,
      );

      if (wallet.balance < totalAmount) {
        throw new BadRequestException(
          `Insufficient balance. Need: ₦${(totalAmount / this.KOBO_PER_NAIRA).toFixed(2)}, Available: ₦${(wallet.balance / this.KOBO_PER_NAIRA).toFixed(2)}`,
        );
      }

      const escrowAccount = await this.ledgerService.getOrCreateEscrowAccount();
      const platformFeeAccount =
        await this.ledgerService.getOrCreatePlatformFeeAccount();
      const vatPayableAccount =
        await this.ledgerService.getOrCreateVatPayableAccount();
      const paystackFeeAccount =
        await this.ledgerService.getOrCreatePaystackFeeAccount();
      const paystackSettlementAccount =
        await this.ledgerService.getOrCreatePaystackSettlementAccount();

      let dueAssignment: any = null;
      let due: any = null;

      if (dto.dueAssignmentId) {
        dueAssignment = await tx.dueAssignment.findUnique({
          where: { id: dto.dueAssignmentId },
          include: { due: true },
        });
        if (!dueAssignment) {
          throw new NotFoundException('Due assignment not found');
        }
        if (dueAssignment.isPaid) {
          throw new BadRequestException('This due has already been paid');
        }
        due = dueAssignment.due;
      } else if (dto.dueId) {
        due = await tx.due.findUnique({
          where: { id: dto.dueId },
        });
        if (!due) {
          throw new NotFoundException('Due not found');
        }
      }

      const walletBalanceBefore = wallet.balance;
      const walletBalanceAfter = walletBalanceBefore - totalAmount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: walletBalanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: walletBalanceAfter },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: totalAmount,
          fee: charges.totalCharges,
          netAmount: dto.amount,
          status: 'COMPLETED',
          reference: `PAY_${randomBytes(16).toString('hex').toUpperCase()}`,
          description: dto.description || 'Payment',
          completedAt: new Date(),
          metadata: {
            charges,
            paymentMethod: dto.paymentMethod,
            organizationId: dto.organizationId,
            dueAmount: dto.amount,
          },
        },
      });

      const payment = await tx.payment.create({
        data: {
          payerId: userId,
          organizationId: dto.organizationId,
          transactionId: transaction.id,
          amount: dto.amount,
          serviceFee: charges.totalCharges,
          status: 'COMPLETED',
          paymentMethod: dto.paymentMethod as any,
          reference: transaction.reference,
          description: dto.description,
          paidAt: new Date(),
          metadata: {
            charges,
            paystackFee: charges.paystackFee,
            platformFee: charges.platformFee,
            vat: charges.vat,
            totalPaid: totalAmount,
          },
        },
      });

      const escrowLines = [
        {
          accountId: wallet.ledgerAccountId!,
          type: 'DEBIT' as const,
          amount: totalAmount,
          description: `Payment from user ${userId} (including charges)`,
        },
        {
          accountId: escrowAccount.id,
          type: 'CREDIT' as const,
          amount: totalAmount,
          description: `Funds held in escrow for payment ${payment.id}`,
        },
      ];

      const escrowJournal = await this.ledgerService.createJournalEntry({
        lines: escrowLines,
        description: `Payment escrow: ${dto.description || 'Payment'}`,
        paymentId: payment.id,
        transactionId: transaction.id,
        createdBy: userId,
      });

      const settlementLines = [
        {
          accountId: escrowAccount.id,
          type: 'DEBIT' as const,
          amount: totalAmount,
          description: `Release funds from escrow for payment ${payment.id}`,
        },
        {
          accountId: (
            await this.getOrganizationWalletLedgerAccount(
              dto.organizationId,
              tx,
            )
          ).id,
          type: 'CREDIT' as const,
          amount: dto.amount,
          description: `Payment settlement to organization (full amount)`,
        },
        {
          accountId: platformFeeAccount.id,
          type: 'CREDIT' as const,
          amount: charges.platformFee,
          description: `Platform service fee (${charges.platformFee} Kobo)`,
        },
        {
          accountId: vatPayableAccount.id,
          type: 'CREDIT' as const,
          amount: charges.vat,
          description: `VAT on platform fee (${charges.vat} Kobo)`,
        },
        {
          accountId: paystackFeeAccount.id,
          type: 'DEBIT' as const,
          amount: charges.paystackFee,
          description: `Paystack transaction fee (${charges.paystackFee} Kobo)`,
        },
        {
          accountId: paystackSettlementAccount.id,
          type: 'CREDIT' as const,
          amount: charges.paystackFee,
          description: `Paystack fee payable to Paystack`,
        },
      ];

      const settlementJournal = await this.ledgerService.createJournalEntry({
        lines: settlementLines,
        description: `Payment settlement: ${dto.description || 'Payment'}`,
        paymentId: payment.id,
        transactionId: transaction.id,
        createdBy: userId,
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { journalEntryId: escrowJournal.id },
      });

      const orgWallet = await tx.wallet.findUnique({
        where: { organizationId: dto.organizationId },
        include: { ledgerAccount: true },
      });

      if (orgWallet) {
        const orgLedgerAccount = await tx.ledgerAccount.findUnique({
          where: { id: orgWallet.ledgerAccountId! },
        });

        if (orgLedgerAccount) {
          await tx.ledgerAccount.update({
            where: { id: orgWallet.ledgerAccountId! },
            data: {
              balance: orgLedgerAccount.balance + dto.amount,
            },
          });

          await tx.wallet.update({
            where: { id: orgWallet.id },
            data: {
              balance: orgWallet.balance + dto.amount,
            },
          });
        }
      }

      if (dueAssignment) {
        await this.handleDuePayment(
          tx,
          dueAssignment.id,
          payment.id,
          dto.amount,
        );
      }

      await this.receiptService.generateReceiptFromPayment(payment.id, userId);

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'PAYMENT_COMPLETED',
          details: JSON.stringify({
            paymentId: payment.id,
            amount: dto.amount,
            totalPaid: totalAmount,
            charges,
            reference: transaction.reference,
            organizationId: dto.organizationId,
            escrowJournalId: escrowJournal.id,
            settlementJournalId: settlementJournal.id,
          }),
        },
      });

      // EMIT WEBSOCKET EVENTS
      this.eventService.emitPaymentReceived({
        paymentId: payment.id,
        userId: userId,
        organizationId: dto.organizationId,
        amount: dto.amount,
        reference: transaction.reference,
        metadata: {
          charges,
          paymentMethod: dto.paymentMethod,
        },
      });

      this.eventService.emitWalletDebited({
        walletId: wallet.id,
        userId: userId,
        amount: totalAmount,
        balance: walletBalanceAfter,
        previousBalance: walletBalanceBefore,
        reference: transaction.reference,
        description: dto.description || 'Payment',
      });

      if (dueAssignment) {
        this.eventService.emitDuesPaid({
          dueId: dueAssignment.dueId,
          studentId: dueAssignment.studentId,
          amount: dto.amount,
          paymentId: payment.id,
          paidAt: new Date(),
        });
      }

      this.eventService.emitWalletBalanceUpdated({
        walletId: wallet.id,
        userId: userId,
        balance: walletBalanceAfter,
        previousBalance: walletBalanceBefore,
        currency: 'NGN',
      });

      await this.cacheService.delete(`wallet:user:${userId}`);
      await this.cacheService.delete(
        `wallet:organization:${dto.organizationId}`,
      );

      this.logger.log(
        `Payment processed: ${payment.id} - Amount: ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)}), Total Paid: ${totalAmount} Kobo (₦${(totalAmount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );

      return {
        payment,
        transaction,
        escrowJournal,
        settlementJournal,
        charges,
        totalPaid: totalAmount,
        balance: walletBalanceAfter,
      };
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getOrganizationWalletLedgerAccount(
    organizationId: string,
    tx: any,
  ) {
    const orgWallet = await tx.wallet.findUnique({
      where: { organizationId },
      include: { ledgerAccount: true },
    });

    if (!orgWallet) {
      throw new NotFoundException('Organization wallet not found');
    }

    return orgWallet.ledgerAccount;
  }

  private async handleDuePayment(
    tx: any,
    dueAssignmentId: string,
    paymentId: string,
    amount: number,
  ) {
    const dueAssignment = await tx.dueAssignment.findUnique({
      where: { id: dueAssignmentId },
      include: { due: true },
    });

    if (!dueAssignment || dueAssignment.isPaid) {
      return;
    }

    const totalPaid = await tx.duePayment.aggregate({
      where: { assignmentId: dueAssignmentId },
      _sum: { amount: true },
    });

    const totalPaidAmount = totalPaid._sum.amount || 0;
    const isFullyPaid = totalPaidAmount + amount >= dueAssignment.amount;

    await tx.duePayment.create({
      data: {
        assignmentId: dueAssignmentId,
        paymentId: paymentId,
        amount: amount,
        paidAt: new Date(),
      },
    });

    if (isFullyPaid) {
      await tx.dueAssignment.update({
        where: { id: dueAssignmentId },
        data: {
          isPaid: true,
          paidAt: new Date(),
        },
      });
    }
  }

  // ============================================
  // MANUAL PAYMENTS (Non-Due Payments)
  // ============================================

  async processManualPayment(userId: string, dto: CreateManualPaymentDto) {
    this.logger.log(
      `Processing manual payment for user: ${userId} - Amount: ${dto.amount} Kobo`,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        include: { ledgerAccount: true },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      if (wallet.balance < dto.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const orgWallet = await tx.wallet.findUnique({
        where: { organizationId: dto.organizationId },
        include: { ledgerAccount: true },
      });

      if (!orgWallet) {
        throw new NotFoundException('Organization wallet not found');
      }

      const walletBalanceBefore = wallet.balance;
      const walletBalanceAfter = walletBalanceBefore - dto.amount;

      const reference =
        dto.reference || `PAY_${randomBytes(16).toString('hex').toUpperCase()}`;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: 'COMPLETED',
          reference,
          description: dto.description,
          completedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: wallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: dto.amount,
          type: 'DEBIT',
          balanceBefore: walletBalanceBefore,
          balanceAfter: walletBalanceAfter,
          description: dto.description,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: walletBalanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: walletBalanceAfter },
      });

      const serviceFee = 0;
      const netAmount = dto.amount - serviceFee;
      const orgWalletBalanceBefore = orgWallet.balance;
      const orgWalletBalanceAfter = orgWalletBalanceBefore + netAmount;

      await tx.ledgerEntry.create({
        data: {
          accountId: orgWallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: netAmount,
          type: 'CREDIT',
          balanceBefore: orgWalletBalanceBefore,
          balanceAfter: orgWalletBalanceAfter,
          description: dto.description,
        },
      });

      await tx.wallet.update({
        where: { id: orgWallet.id },
        data: { balance: orgWalletBalanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: orgWallet.ledgerAccountId! },
        data: { balance: orgWalletBalanceAfter },
      });

      const payment = await tx.payment.create({
        data: {
          payerId: userId,
          organizationId: dto.organizationId,
          transactionId: transaction.id,
          amount: dto.amount,
          serviceFee: serviceFee,
          status: 'COMPLETED',
          paymentMethod: dto.paymentMethod as any,
          reference,
          description: dto.description,
          paidAt: new Date(),
          metadata: {
            category: dto.category || 'OTHER',
            categoryId: dto.categoryId,
            manualPayment: true,
          },
        },
      });

      const journalLines = [
        {
          accountId: wallet.ledgerAccountId!,
          type: 'DEBIT' as const,
          amount: dto.amount,
          description: `Manual payment from user ${userId}`,
        },
        {
          accountId: orgWallet.ledgerAccountId!,
          type: 'CREDIT' as const,
          amount: netAmount,
          description: `Manual payment to organization ${dto.organizationId}`,
        },
      ];

      if (serviceFee > 0) {
        const platformFeeAccount =
          await this.ledgerService.getOrCreatePlatformFeeAccount();
        journalLines.push({
          accountId: platformFeeAccount.id,
          type: 'CREDIT' as const,
          amount: serviceFee,
          description: 'Platform service fee',
        });
      }

      const journalEntry = await this.ledgerService.createJournalEntry({
        lines: journalLines,
        description: `Manual payment: ${dto.description}`,
        paymentId: payment.id,
        transactionId: transaction.id,
        createdBy: userId,
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { journalEntryId: journalEntry.id },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { journalEntryId: journalEntry.id },
      });

      if (dto.dueAssignmentId) {
        const dueAssignment = await tx.dueAssignment.findUnique({
          where: { id: dto.dueAssignmentId },
          include: { due: true },
        });

        if (dueAssignment && !dueAssignment.isPaid) {
          const totalPaid = await tx.duePayment.aggregate({
            where: { assignmentId: dueAssignment.id },
            _sum: { amount: true },
          });

          const totalPaidAmount = totalPaid._sum.amount || 0;
          const isFullyPaid =
            totalPaidAmount + dto.amount >= dueAssignment.amount;

          await tx.duePayment.create({
            data: {
              assignmentId: dueAssignment.id,
              paymentId: payment.id,
              amount: dto.amount,
              paidAt: new Date(),
            },
          });

          if (isFullyPaid) {
            await tx.dueAssignment.update({
              where: { id: dueAssignment.id },
              data: {
                isPaid: true,
                paidAt: new Date(),
              },
            });
          }
        }
      }

      await this.receiptService.generateReceiptFromPayment(payment.id, userId);

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'MANUAL_PAYMENT',
          details: JSON.stringify({
            paymentId: payment.id,
            amount: dto.amount,
            reference,
            organizationId: dto.organizationId,
            category: dto.category || 'OTHER',
            journalEntryId: journalEntry.id,
          }),
        },
      });

      this.eventService.emitPaymentReceived({
        paymentId: payment.id,
        userId: userId,
        organizationId: dto.organizationId,
        amount: dto.amount,
        reference: reference,
        metadata: {
          category: dto.category || 'OTHER',
          manualPayment: true,
        },
      });

      this.eventService.emitWalletDebited({
        walletId: wallet.id,
        userId: userId,
        amount: dto.amount,
        balance: walletBalanceAfter,
        previousBalance: walletBalanceBefore,
        reference: reference,
        description: dto.description || 'Manual payment',
      });

      await this.cacheService.delete(`wallet:user:${userId}`);

      this.logger.log(
        `Manual payment processed: ${payment.id} - ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );
      return {
        payment,
        transaction,
        journalEntry,
        balance: walletBalanceAfter,
      };
    });
  }

  // ============================================
  // ORGANIZATION WITHDRAWALS (Admin Only)
  // ============================================

  async requestOrganizationWithdrawal(
    userId: string,
    dto: WithdrawalRequestDto,
  ) {
    this.logger.log(
      `Requesting organization withdrawal for user: ${userId} - Amount: ${dto.amount} Kobo`,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: dto.organizationId,
        membershipType: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You must be an admin of this organization to request withdrawal',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { organizationId: dto.organizationId },
        include: { ledgerAccount: true },
      });

      if (!wallet) {
        throw new NotFoundException('Organization wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      if (wallet.balance < dto.amount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ₦${(wallet.balance / this.KOBO_PER_NAIRA).toFixed(2)}`,
        );
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - dto.amount;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: 'PENDING',
          reference: `WTH_${randomBytes(16).toString('hex').toUpperCase()}`,
          description: `Withdrawal request by ${userId}`,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: wallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: dto.amount,
          type: 'DEBIT',
          balanceBefore,
          balanceAfter,
          description: `Withdrawal request by ${userId}`,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: balanceAfter },
      });

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          walletId: wallet.id,
          transactionId: transaction.id,
          amount: dto.amount,
          status: 'PENDING',
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          reference: transaction.reference,
          requestedAt: new Date(),
          metadata: {
            organizationId: dto.organizationId,
            organizationName: organization.name,
            reason: dto.reason,
          },
        },
      });

      await tx.walletHold.create({
        data: {
          walletId: wallet.id,
          amount: dto.amount,
          reason: `Withdrawal request #${withdrawal.id}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'ORGANIZATION_WITHDRAWAL_REQUESTED',
          details: JSON.stringify({
            withdrawalId: withdrawal.id,
            organizationId: dto.organizationId,
            amount: dto.amount,
            bankName: dto.bankName,
          }),
        },
      });

      await this.cacheService.delete(
        `wallet:organization:${dto.organizationId}`,
      );

      this.eventService.emitWithdrawalRequested({
        withdrawalId: withdrawal.id,
        userId: userId,
        organizationId: dto.organizationId,
        amount: dto.amount,
        reference: transaction.reference,
        bankName: dto.bankName,
      });

      await this.notifyPlatformAdmins('WITHDRAWAL_REQUEST', {
        organizationId: dto.organizationId,
        organizationName: organization.name,
        amount: dto.amount,
        amountFormatted: `₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)}`,
        requesterId: userId,
        withdrawalId: withdrawal.id,
      });

      this.logger.log(
        `Organization withdrawal requested: ${withdrawal.id} - ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );
      return withdrawal;
    });
  }

  async approveOrganizationWithdrawal(
    withdrawalId: string,
    adminUserId: string,
  ) {
    this.logger.log(`Approving withdrawal ${withdrawalId}`);

    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: { include: { ledgerAccount: true } } },
      });

      if (!withdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      if (withdrawal.status !== 'PENDING') {
        throw new BadRequestException('Withdrawal is not pending');
      }

      const admin = await tx.admin.findFirst({
        where: {
          userId: adminUserId,
          status: 'ACTIVE',
          adminType: 'PLATFORM_ADMIN',
        },
      });

      if (!admin) {
        throw new ForbiddenException(
          'Only platform admins can approve withdrawals',
        );
      }

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });

      const wallet = withdrawal.wallet;
      const journalEntry = await this.ledgerService.createJournalEntry({
        lines: [
          {
            accountId: wallet.ledgerAccountId!,
            type: 'CREDIT' as const,
            amount: withdrawal.amount,
            description: `Reversal of withdrawal hold - approved`,
          },
          {
            accountId: wallet.ledgerAccountId!,
            type: 'DEBIT' as const,
            amount: withdrawal.amount,
            description: `Withdrawal completed - ${withdrawal.bankName}`,
          },
        ],
        description: `Withdrawal approved and completed #${withdrawalId}`,
        withdrawalId: withdrawal.id,
        transactionId: withdrawal.transactionId!,
        createdBy: adminUserId,
      });

      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { journalEntryId: journalEntry.id },
      });

      await tx.transaction.update({
        where: { id: withdrawal.transactionId! },
        data: { journalEntryId: journalEntry.id, status: 'COMPLETED' },
      });

      await tx.walletHold.updateMany({
        where: {
          walletId: withdrawal.walletId,
          reason: { contains: `Withdrawal request #${withdrawalId}` },
          status: 'ACTIVE',
        },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: adminUserId,
          activity: 'ORGANIZATION_WITHDRAWAL_APPROVED',
          details: JSON.stringify({
            withdrawalId,
            organizationId: withdrawal.wallet?.organizationId,
            amount: withdrawal.amount,
            journalEntryId: journalEntry.id,
          }),
        },
      });

      this.eventService.emitWithdrawalApproved({
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        reference: withdrawal.reference,
        processedAt: new Date(),
      });

      await this.notifyUser(withdrawal.userId, 'WITHDRAWAL_APPROVED', {
        withdrawalId,
        amount: withdrawal.amount,
        amountFormatted: `₦${(withdrawal.amount / this.KOBO_PER_NAIRA).toFixed(2)}`,
        bankName: withdrawal.bankName,
      });

      this.logger.log(`Withdrawal approved: ${withdrawalId}`);
      return updatedWithdrawal;
    });
  }

  async rejectOrganizationWithdrawal(
    withdrawalId: string,
    adminUserId: string,
    reason?: string,
  ) {
    this.logger.log(`Rejecting withdrawal ${withdrawalId}`);

    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: { include: { ledgerAccount: true } } },
      });

      if (!withdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      if (withdrawal.status !== 'PENDING') {
        throw new BadRequestException('Withdrawal is not pending');
      }

      const admin = await tx.admin.findFirst({
        where: {
          userId: adminUserId,
          status: 'ACTIVE',
          adminType: 'PLATFORM_ADMIN',
        },
      });

      if (!admin) {
        throw new ForbiddenException(
          'Only platform admins can reject withdrawals',
        );
      }

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'FAILED',
          processedAt: new Date(),
          failedAt: new Date(),
          failureReason: reason || 'Withdrawal rejected by admin',
        },
      });

      const wallet = withdrawal.wallet;
      const refundBalance = wallet.balance + withdrawal.amount;

      const journalEntry = await this.ledgerService.createJournalEntry({
        lines: [
          {
            accountId: wallet.ledgerAccountId!,
            type: 'CREDIT' as const,
            amount: withdrawal.amount,
            description: `Refund for rejected withdrawal #${withdrawalId}`,
          },
          {
            accountId: wallet.ledgerAccountId!,
            type: 'DEBIT' as const,
            amount: withdrawal.amount,
            description: `Reversal of withdrawal hold - rejected`,
          },
        ],
        description: `Withdrawal rejected and refunded #${withdrawalId}`,
        withdrawalId: withdrawal.id,
        transactionId: withdrawal.transactionId!,
        createdBy: adminUserId,
      });

      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { journalEntryId: journalEntry.id },
      });

      await tx.wallet.update({
        where: { id: withdrawal.walletId },
        data: { balance: refundBalance },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: refundBalance },
      });

      await tx.transaction.update({
        where: { id: withdrawal.transactionId! },
        data: { status: 'FAILED', journalEntryId: journalEntry.id },
      });

      await tx.walletHold.updateMany({
        where: {
          walletId: withdrawal.walletId,
          reason: { contains: `Withdrawal request #${withdrawalId}` },
          status: 'ACTIVE',
        },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: adminUserId,
          activity: 'ORGANIZATION_WITHDRAWAL_REJECTED',
          details: JSON.stringify({
            withdrawalId,
            organizationId: withdrawal.wallet?.organizationId,
            amount: withdrawal.amount,
            reason,
            journalEntryId: journalEntry.id,
          }),
        },
      });

      this.eventService.emitWithdrawalRejected({
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        reference: withdrawal.reference,
        reason: reason || 'Withdrawal rejected by admin',
      });

      await this.notifyUser(withdrawal.userId, 'WITHDRAWAL_REJECTED', {
        withdrawalId,
        amount: withdrawal.amount,
        amountFormatted: `₦${(withdrawal.amount / this.KOBO_PER_NAIRA).toFixed(2)}`,
        reason: reason || 'Withdrawal rejected by admin',
      });

      this.logger.log(`Withdrawal rejected: ${withdrawalId}`);
      return updatedWithdrawal;
    });
  }

  // ============================================
  // SAVINGS GOALS
  // ============================================

  async createSavingsGoal(userId: string, dto: CreateSavingsGoalDto) {
    this.logger.log(
      `Creating savings goal for user: ${userId} - Target: ${dto.targetAmount} Kobo`,
    );

    const goal = await this.prisma.savingsGoal.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: 'ACTIVE',
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'SAVINGS_GOAL_CREATED',
        details: JSON.stringify({
          goalId: goal.id,
          title: goal.title,
          targetAmount: goal.targetAmount,
        }),
      },
    });

    this.eventService.emit(SystemEvents.SAVINGS_GOAL_CREATED, {
      goalId: goal.id,
      userId: userId,
      title: goal.title,
      targetAmount: goal.targetAmount,
      createdAt: goal.createdAt,
    });

    this.logger.log(
      `Savings goal created: ${goal.id} - Target: ${dto.targetAmount} Kobo (₦${(dto.targetAmount / this.KOBO_PER_NAIRA).toFixed(2)})`,
    );
    return goal;
  }

  async depositToSavings(userId: string, dto: SavingsDepositDto) {
    this.logger.log(
      `Depositing to savings goal: ${dto.goalId} - Amount: ${dto.amount} Kobo`,
    );

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        include: { ledgerAccount: true },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== 'ACTIVE') {
        throw new BadRequestException('Wallet is not active');
      }

      if (wallet.balance < dto.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const goal = await tx.savingsGoal.findUnique({
        where: { id: dto.goalId },
      });

      if (!goal) {
        throw new NotFoundException('Savings goal not found');
      }

      if (goal.status !== 'ACTIVE') {
        throw new BadRequestException('Savings goal is not active');
      }

      const walletBalanceBefore = wallet.balance;
      const walletBalanceAfter = walletBalanceBefore - dto.amount;

      await tx.savingsTransaction.create({
        data: {
          goalId: dto.goalId,
          amount: dto.amount,
          type: 'DEPOSIT',
          description: dto.description || 'Savings deposit',
        },
      });

      const goalBalanceBefore = goal.currentAmount;
      const goalBalanceAfter = goalBalanceBefore + dto.amount;

      await tx.savingsGoal.update({
        where: { id: dto.goalId },
        data: {
          currentAmount: goalBalanceAfter,
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: 'COMPLETED',
          reference: `SAV_${randomBytes(16).toString('hex').toUpperCase()}`,
          description: `Savings deposit: ${goal.title}`,
          completedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: wallet.ledgerAccountId!,
          transactionId: transaction.id,
          amount: dto.amount,
          type: 'DEBIT',
          balanceBefore: walletBalanceBefore,
          balanceAfter: walletBalanceAfter,
          description: `Savings deposit: ${goal.title}`,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: walletBalanceAfter },
      });

      await tx.ledgerAccount.update({
        where: { id: wallet.ledgerAccountId! },
        data: { balance: walletBalanceAfter },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'SAVINGS_DEPOSIT',
          details: JSON.stringify({
            goalId: dto.goalId,
            amount: dto.amount,
            currentAmount: goalBalanceAfter,
          }),
        },
      });

      this.eventService.emit(SystemEvents.SAVINGS_DEPOSIT, {
        goalId: dto.goalId,
        userId: userId,
        amount: dto.amount,
        currentAmount: goalBalanceAfter,
        previousAmount: goalBalanceBefore,
        reference: transaction.reference,
      });

      this.eventService.emitWalletDebited({
        walletId: wallet.id,
        userId: userId,
        amount: dto.amount,
        balance: walletBalanceAfter,
        previousBalance: walletBalanceBefore,
        reference: transaction.reference,
        description: `Savings deposit: ${goal.title}`,
      });

      await this.cacheService.delete(`wallet:user:${userId}`);

      this.logger.log(
        `Savings deposit completed: ${dto.goalId} - ${dto.amount} Kobo (₦${(dto.amount / this.KOBO_PER_NAIRA).toFixed(2)})`,
      );
      return goal;
    });
  }

  async getSavingsGoals(userId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return goals;
  }

  // ============================================
  // FINANCIAL REPORTS
  // ============================================

  async getFinancialOverview(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const wallets = await this.prisma.wallet.findMany({
      where: {
        organization: where,
      },
    });

    const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
    const totalHeld = wallets.reduce((sum, w) => sum + w.heldBalance, 0);

    const recentPayments = await this.prisma.payment.findMany({
      where: {
        organization: where,
        status: 'COMPLETED',
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        payer: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        organization: true,
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
    });

    const totalDues = await this.prisma.due.count({
      where: {
        organization: where,
        status: 'ACTIVE',
      },
    });

    const totalPaidDues = await this.prisma.dueAssignment.count({
      where: {
        isPaid: true,
        due: {
          organization: where,
        },
      },
    });

    const totalPendingDues = await this.prisma.dueAssignment.count({
      where: {
        isPaid: false,
        due: {
          organization: where,
          status: 'ACTIVE',
        },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyTransactions = await this.prisma.transaction.count({
      where: {
        createdAt: { gte: today },
        wallet: {
          organization: where,
        },
      },
    });

    return {
      totalBalance,
      totalHeld,
      totalWallets: wallets.length,
      dueStats: {
        total: totalDues,
        paid: totalPaidDues,
        pending: totalPendingDues,
        completionRate:
          totalDues > 0 ? Math.round((totalPaidDues / totalDues) * 100) : 0,
      },
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        amountFormatted: `₦${(p.amount / this.KOBO_PER_NAIRA).toFixed(2)}`,
        payer: p.payer?.username || 'Unknown',
        organization: p.organization?.name || 'Unknown',
        createdAt: p.createdAt,
        status: p.status,
        journalEntryId: p.journalEntryId,
      })),
      dailyTransactions,
    };
  }

  // ============================================
  // ORGANIZATION FINANCIAL OVERVIEW
  // ============================================

  async getOrganizationFinancialOverview(
    organizationId: string,
    userId: string,
  ) {
    this.logger.log(
      `Getting financial overview for organization: ${organizationId}`,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        membershipType: { in: ['ADMIN', 'STAFF'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        "You do not have access to this organization's financial data",
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        institution: true,
        wallet: {
          include: {
            ledgerAccount: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const wallet = organization.wallet;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet?.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
    });

    const [totalDues, paidDues, pendingDues, overdueDues] = await Promise.all([
      this.prisma.due.count({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.dueAssignment.count({
        where: {
          due: { organizationId },
          isPaid: true,
        },
      }),
      this.prisma.dueAssignment.count({
        where: {
          due: { organizationId, status: 'ACTIVE' },
          isPaid: false,
        },
      }),
      this.prisma.dueAssignment.count({
        where: {
          due: {
            organizationId,
            status: 'ACTIVE',
            dueDate: { lt: new Date() },
          },
          isPaid: false,
        },
      }),
    ]);

    const recentPayments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: 'COMPLETED',
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        payer: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
    });

    const totalRevenue = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
      },
      _sum: { amount: true },
    });

    const revenueLast30Days = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
    });

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const upcomingDues = await this.prisma.due.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        dueDate: { gte: new Date(), lte: thirtyDaysFromNow },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    const upcomingDuesWithPending = await Promise.all(
      upcomingDues.map(async (due) => {
        const pendingCount = await this.prisma.dueAssignment.count({
          where: {
            dueId: due.id,
            isPaid: false,
          },
        });
        return {
          ...due,
          pendingCount,
        };
      }),
    );

    const memberCount = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    const studentMemberCount = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: 'ACTIVE',
        membershipType: 'STUDENT',
      },
    });

    const activeDuesAssignments = await this.prisma.dueAssignment.count({
      where: {
        due: { organizationId, status: 'ACTIVE' },
        isPaid: false,
      },
    });

    const totalDueAmount = await this.prisma.due.aggregate({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      _sum: { amount: true },
    });

    const totalCollected = await this.prisma.duePayment.aggregate({
      where: {
        assignment: {
          due: { organizationId },
        },
      },
      _sum: { amount: true },
    });

    const monthlyRevenue = await this.getMonthlyRevenue(organizationId);

    const totalDueAmountValue = totalDueAmount._sum.amount || 0;
    const totalCollectedValue = totalCollected._sum.amount || 0;

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        institution: organization.institution?.name,
      },
      wallet: {
        balance: wallet?.balance || 0,
        balanceFormatted: `₦${((wallet?.balance || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        heldBalance: wallet?.heldBalance || 0,
        heldBalanceFormatted: `₦${((wallet?.heldBalance || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        ledgerAccountId: wallet?.ledgerAccountId,
      },
      memberStats: {
        total: memberCount,
        students: studentMemberCount,
        admins: memberCount - studentMemberCount,
      },
      dueStats: {
        total: totalDues,
        paid: paidDues,
        pending: pendingDues,
        overdue: overdueDues,
        activeAssignments: activeDuesAssignments,
        totalAmount: totalDueAmountValue,
        totalAmountFormatted: `₦${(totalDueAmountValue / this.KOBO_PER_NAIRA).toFixed(2)}`,
        totalCollected: totalCollectedValue,
        totalCollectedFormatted: `₦${(totalCollectedValue / this.KOBO_PER_NAIRA).toFixed(2)}`,
        collectionRate:
          totalDueAmountValue > 0
            ? Math.round((totalCollectedValue / totalDueAmountValue) * 100)
            : 0,
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        totalFormatted: `₦${((totalRevenue._sum.amount || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        last30Days: revenueLast30Days._sum.amount || 0,
        last30DaysFormatted: `₦${((revenueLast30Days._sum.amount || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        monthly: monthlyRevenue,
      },
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        amountFormatted: `₦${(Number(t.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
        journalEntryId: t.journalEntryId,
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        amountFormatted: `₦${(Number(p.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        payer: p.payer?.username || 'Unknown',
        payerName: p.payer?.profile?.firstName
          ? `${p.payer.profile.firstName} ${p.payer.profile.lastName || ''}`
          : p.payer?.username || 'Unknown',
        description: p.description,
        createdAt: p.createdAt,
        journalEntryId: p.journalEntryId,
      })),
      upcomingDues: upcomingDuesWithPending.map((d) => ({
        id: d.id,
        name: d.name,
        amount: Number(d.amount),
        amountFormatted: `₦${(Number(d.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        dueDate: d.dueDate,
        pendingCount: d.pendingCount,
      })),
    };
  }

  private async getMonthlyRevenue(organizationId: string) {
    const months: Array<{
      month: string;
      year: number;
      amount: number;
      amountFormatted: string;
    }> = [];
    const currentDate = new Date();

    for (let i = 0; i < 6; i++) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth();
      const year = date.getFullYear();

      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const revenue = await this.prisma.payment.aggregate({
        where: {
          organizationId,
          status: 'COMPLETED',
          paidAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: { amount: true },
      });

      months.push({
        month: startDate.toLocaleString('default', { month: 'short' }),
        year,
        amount: Number(revenue._sum.amount || 0),
        amountFormatted: `₦${((revenue._sum.amount || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
      });
    }

    return months.reverse();
  }

  // ============================================
  // ORGANIZATION FINANCE DASHBOARD
  // ============================================

  async getOrganizationFinanceDashboard(
    organizationId: string,
    userId: string,
  ) {
    this.logger.log(
      `Getting finance dashboard for organization: ${organizationId}`,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        membershipType: { in: ['ADMIN', 'STAFF'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        "You do not have access to this organization's financial data",
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        wallet: {
          include: {
            ledgerAccount: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        walletId: organization.wallet?.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId,
      },
      include: {
        payer: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const dueAssignments = await this.prisma.dueAssignment.findMany({
      where: {
        due: { organizationId },
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
          },
        },
        due: true,
        duePayments: {
          include: {
            payment: {
              include: {
                journalEntry: {
                  include: {
                    lines: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { due: { dueDate: 'asc' } },
      take: 20,
    });

    const topContributors = await this.prisma.payment.groupBy({
      by: ['payerId'],
      where: {
        organizationId,
        status: 'COMPLETED',
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });

    const contributorDetails = await Promise.all(
      topContributors.map(async (contrib) => {
        const user = await this.prisma.user.findUnique({
          where: { id: contrib.payerId },
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        });
        return {
          userId: contrib.payerId,
          totalAmount: Number(contrib._sum.amount || 0),
          totalAmountFormatted: `₦${((contrib._sum.amount || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
          user,
        };
      }),
    );

    const overdueDues = await this.prisma.dueAssignment.findMany({
      where: {
        due: {
          organizationId,
          status: 'ACTIVE',
          dueDate: { lt: new Date() },
        },
        isPaid: false,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
          },
        },
        due: true,
      },
      take: 20,
      orderBy: { due: { dueDate: 'asc' } },
    });

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const duesDueSoon = await this.prisma.dueAssignment.findMany({
      where: {
        due: {
          organizationId,
          status: 'ACTIVE',
          dueDate: { gte: new Date(), lte: sevenDaysFromNow },
        },
        isPaid: false,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
          },
        },
        due: true,
      },
      take: 20,
      orderBy: { due: { dueDate: 'asc' } },
    });

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      wallet: {
        balance: organization.wallet?.balance || 0,
        balanceFormatted: `₦${((organization.wallet?.balance || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        heldBalance: organization.wallet?.heldBalance || 0,
        heldBalanceFormatted: `₦${((organization.wallet?.heldBalance || 0) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        ledgerAccountId: organization.wallet?.ledgerAccountId,
      },
      recentTransactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        amountFormatted: `₦${(Number(t.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
        journalEntryId: t.journalEntryId,
      })),
      recentPayments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        amountFormatted: `₦${(Number(p.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        payer: p.payer?.username || 'Unknown',
        payerName: p.payer?.profile?.firstName
          ? `${p.payer.profile.firstName} ${p.payer.profile.lastName || ''}`
          : p.payer?.username || 'Unknown',
        description: p.description,
        createdAt: p.createdAt,
        journalEntryId: p.journalEntryId,
      })),
      dueAssignments: dueAssignments.map((da) => ({
        id: da.id,
        student: da.student?.user?.username || 'Unknown',
        studentName: da.student?.user?.profile?.firstName
          ? `${da.student.user.profile.firstName} ${da.student.user.profile.lastName || ''}`
          : da.student?.user?.username || 'Unknown',
        amount: Number(da.amount),
        amountFormatted: `₦${(Number(da.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        dueName: da.due?.name,
        dueDate: da.due?.dueDate,
        isPaid: da.isPaid,
        paidAt: da.paidAt,
        payments: da.duePayments.map((dp) => ({
          amount: Number(dp.amount),
          amountFormatted: `₦${(Number(dp.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
          paidAt: dp.paidAt,
          journalEntryId: dp.payment?.journalEntryId,
        })),
      })),
      topContributors: contributorDetails,
      overdueDues: overdueDues.map((da) => ({
        id: da.id,
        student: da.student?.user?.username || 'Unknown',
        studentName: da.student?.user?.profile?.firstName
          ? `${da.student.user.profile.firstName} ${da.student.user.profile.lastName || ''}`
          : da.student?.user?.username || 'Unknown',
        amount: Number(da.amount),
        amountFormatted: `₦${(Number(da.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        dueName: da.due?.name,
        dueDate: da.due?.dueDate,
        daysOverdue: Math.floor(
          (new Date().getTime() -
            new Date(da.due?.dueDate || new Date()).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      })),
      duesDueSoon: duesDueSoon.map((da) => ({
        id: da.id,
        student: da.student?.user?.username || 'Unknown',
        studentName: da.student?.user?.profile?.firstName
          ? `${da.student.user.profile.firstName} ${da.student.user.profile.lastName || ''}`
          : da.student?.user?.username || 'Unknown',
        amount: Number(da.amount),
        amountFormatted: `₦${(Number(da.amount) / this.KOBO_PER_NAIRA).toFixed(2)}`,
        dueName: da.due?.name,
        dueDate: da.due?.dueDate,
        daysUntilDue: Math.floor(
          (new Date(da.due?.dueDate || new Date()).getTime() -
            new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      })),
    };
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateFinanceCache(userId?: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTag('finance');
      await this.cacheService.invalidateByTag('wallet');
      await this.cacheService.invalidateByTag('transactions');
      await this.cacheService.invalidateByTag('dues');
      await this.cacheService.invalidateByTag('savings');
      await this.cacheService.invalidateByTag('receipts');
      await this.cacheService.invalidateByTag('ledger');
      await this.cacheService.invalidateByTag('reports');

      if (userId) {
        await this.cacheService.invalidateByTag(`user:${userId}`);
        await this.cacheService.delete(`wallet:user:${userId}`);
        await this.cacheService.delete(`transactions:user:${userId}`);
        await this.cacheService.delete(`savings:user:${userId}`);
        await this.cacheService.delete(`receipts:user:${userId}`);
        await this.cacheService.invalidatePattern(`wallet:user:${userId}:*`);
        await this.cacheService.invalidatePattern(
          `transactions:user:${userId}:*`,
        );
      }

      this.logger.log(
        `Finance cache invalidated${userId ? ` for user: ${userId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(`Failed to invalidate finance cache: ${error.message}`);
    }
  }

  // ============================================
  // NOTIFICATION HELPERS
  // ============================================

  private async notifyPlatformAdmins(event: string, data: any) {
    const admins = await this.prisma.admin.findMany({
      where: {
        adminType: 'PLATFORM_ADMIN',
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          userId: admin.userId,
          title: `Withdrawal Request: ${data.organizationName}`,
          body: `${data.organizationName} has requested a withdrawal of ${data.amountFormatted}`,
          type: 'FINANCIAL',
          priority: 'HIGH',
          data: data,
        },
      });

      await this.emailService.sendEmail(
        admin.user.email,
        'Withdrawal Request - Heightt',
        `<p>${data.organizationName} has requested a withdrawal of ${data.amountFormatted}</p>
         <p>Please log in to the admin dashboard to approve or reject this request.</p>
         <p>Request ID: ${data.withdrawalId}</p>`,
      );
    }
  }

  private async notifyUser(userId: string, event: string, data: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return;

    let title = '';
    let body = '';

    if (event === 'WITHDRAWAL_APPROVED') {
      title = 'Withdrawal Approved ✅';
      body = `Your withdrawal of ${data.amountFormatted} has been approved and is being processed.`;
    } else if (event === 'WITHDRAWAL_REJECTED') {
      title = 'Withdrawal Rejected ❌';
      body = `Your withdrawal of ${data.amountFormatted} was rejected. Reason: ${data.reason || 'Not specified'}`;
    }

    await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type: 'FINANCIAL',
        priority: 'HIGH',
        data: data,
      },
    });

    await this.emailService.sendEmail(
      user.email,
      title,
      `<p>${body}</p><p>Reference: ${data.withdrawalId}</p>`,
    );
  }
}
