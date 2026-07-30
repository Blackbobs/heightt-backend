import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { GenerateReceiptDto } from './dto';
import { randomBytes } from 'crypto';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // GENERATE RECEIPT
  // ============================================

  async generateReceipt(userId: string, dto: GenerateReceiptDto) {
    this.logger.log(`Generating receipt for payment: ${dto.paymentId}`);

    // Get payment details
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: {
        payer: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        transaction: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Check if user has permission to view this payment
    if (payment.payerId !== userId) {
      const isAdmin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      const isOrgAdmin = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: payment.organizationId,
          membershipType: { in: ['ADMIN', 'STAFF'] },
          status: 'ACTIVE',
        },
      });

      if (!isAdmin && !isOrgAdmin) {
        throw new ForbiddenException(
          'You do not have permission to generate receipt for this payment',
        );
      }
    }

    // Check if receipt already exists
    const existingReceipt = await this.prisma.receipt.findUnique({
      where: { paymentId: payment.id },
    });

    if (existingReceipt) {
      return existingReceipt;
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber();
    const totalAmount = payment.amount + payment.serviceFee;

    const receipt = await this.prisma.receipt.create({
      data: {
        paymentId: payment.id,
        userId: payment.payerId,
        organizationId: payment.organizationId,
        receiptNumber,
        reference: payment.reference,
        amount: payment.amount,
        serviceFee: payment.serviceFee,
        totalAmount: totalAmount,
        currency: 'NGN',
        payerName:
          dto.payerName ||
          payment.payer?.profile?.firstName +
            ' ' +
            payment.payer?.profile?.lastName ||
          payment.payer?.username ||
          'Unknown',
        payerEmail: dto.payerEmail || payment.payer?.email || '',
        payerPhone: dto.payerPhone,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paidAt || payment.createdAt,
        description: dto.description || payment.description,
        organizationName: payment.organization?.name,
        organizationSlug: payment.organization?.slug,
        items: dto.items || [],
        status: 'ISSUED',
      },
    });

    this.logger.log(`Receipt generated: ${receipt.receiptNumber}`);
    return receipt;
  }

  // ============================================
  // GET RECEIPTS
  // ============================================

  async getReceiptById(receiptId: string, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        payment: {
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
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    // Check permission
    if (receipt.userId !== userId) {
      const isAdmin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      const isOrgAdmin = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: receipt.organizationId || '',
          membershipType: { in: ['ADMIN', 'STAFF'] },
          status: 'ACTIVE',
        },
      });

      if (!isAdmin && !isOrgAdmin) {
        throw new ForbiddenException(
          'You do not have permission to view this receipt',
        );
      }
    }

    return receipt;
  }

  async getUserReceipts(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      startDate?: string;
      endDate?: string;
      organizationId?: string;
    },
  ) {
    const where: any = { userId };

    if (filters?.startDate) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(filters.startDate),
      };
    }
    if (filters?.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };
    }
    if (filters?.organizationId) {
      where.organizationId = filters.organizationId;
    }

    const skip = (page - 1) * limit;
    const [receipts, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        include: {
          payment: {
            include: {
              organization: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return {
      data: receipts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrganizationReceipts(
    organizationId: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // Check if user is admin of this organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to view receipts for this organization',
      );
    }

    const skip = (page - 1) * limit;
    const [receipts, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where: { organizationId },
        skip,
        take: limit,
        include: {
          payment: {
            include: {
              payer: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  profile: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.receipt.count({ where: { organizationId } }),
    ]);

    return {
      data: receipts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // RECEIPT ACTIONS
  // ============================================

  async trackDownload(receiptId: string, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    if (receipt.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to download this receipt',
      );
    }

    const updated = await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        downloadCount: { increment: 1 },
        lastDownloaded: new Date(),
      },
    });

    return updated;
  }

  async markViewed(receiptId: string, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    if (receipt.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this receipt',
      );
    }

    const updated = await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        viewedAt: new Date(),
      },
    });

    return updated;
  }

  async voidReceipt(receiptId: string, userId: string, reason?: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    // Only platform admins can void receipts
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!isPlatformAdmin) {
      throw new ForbiddenException('Only platform admins can void receipts');
    }

    if (receipt.status === 'VOIDED') {
      throw new BadRequestException('Receipt is already voided');
    }

    const updated = await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'VOIDED',
        metadata: {
          voidedBy: userId,
          voidedAt: new Date(),
          reason: reason || 'No reason provided',
        },
      },
    });

    this.logger.log(`Receipt ${receipt.receiptNumber} voided by ${userId}`);
    return updated;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async generateReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;

    // Get the last receipt number
    const lastReceipt = await this.prisma.receipt.findFirst({
      where: {
        receiptNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        receiptNumber: 'desc',
      },
    });

    let nextNumber = 1;
    if (lastReceipt) {
      const lastNumber = parseInt(lastReceipt.receiptNumber.split('-')[2]);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  // ============================================
  // RECEIPT GENERATION FROM PAYMENT
  // ============================================

  async generateReceiptFromPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        payer: {
          include: {
            profile: true,
          },
        },
        organization: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const dto: GenerateReceiptDto = {
      paymentId: payment.id,
      payerName: payment.payer?.profile?.firstName
        ? `${payment.payer.profile.firstName} ${payment.payer.profile.lastName || ''}`
        : payment.payer?.username || 'Unknown',
      payerEmail: payment.payer?.email || '',
      description: payment.description || 'Payment',
    };

    return this.generateReceipt(userId, dto);
  }
}
