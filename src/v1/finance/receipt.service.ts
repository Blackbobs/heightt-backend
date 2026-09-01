import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EmailService } from '../../email/email.service';
import { GenerateReceiptDto } from './dto';
import { randomBytes } from 'crypto';
import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { renderHeighttEmail } from '../../email/heightt-email.template';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
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

    // Fire-and-forget: immediately render the branded PDF and email it to the
    // payer. Kept outside the payment transaction so slow SMTP/HTTP calls
    // never delay or fail the payment itself.
    setImmediate(() => {
      this.deliverReceiptPdf(receipt.id).catch((err: any) =>
        this.logger.error(
          `Receipt delivery failed for ${receipt.receiptNumber}: ${err.message}`,
        ),
      );
    });

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

  // ============================================
  // RECEIPT PDF GENERATION
  // ============================================

  /**
   * Resolve the most specific available logo for an organization.
   * Chain: organization logo -> department logo -> faculty logo -> institution logo.
   */
  private async getReceiptBranding(organizationId?: string | null): Promise<{
    logoUrl?: string;
    organizationName?: string;
    institutionName?: string;
  }> {
    if (!organizationId) return {};
    const org = (await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        institution: { select: { name: true, logo: true } },
        faculty: { select: { name: true, logo: true } },
        department: { select: { name: true, logo: true } },
      },
    })) as any;

    if (!org) return {};
    const logoUrl =
      org.logo ||
      org.department?.logo ||
      org.faculty?.logo ||
      org.institution?.logo ||
      null;
    return {
      logoUrl: logoUrl || undefined,
      organizationName: org.name,
      institutionName: org.institution?.name,
    };
  }

  /** Format Kobo into a NGN display string. */
  private formatNaira(kobo: number): string {
    const naira = (kobo || 0) / 100;
    return `\u20A6${naira.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /** Download a logo image (PNG/JPEG only - PDFKit cannot embed webp/svg). */
  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const lower = url.toLowerCase().split('?')[0];
      const isRaster =
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg');
      let fetchUrl = url;
      if (
        !isRaster &&
        lower.includes('res.cloudinary.com') &&
        !lower.includes('/f_png/') &&
        !lower.includes('/f_jpg/')
      ) {
        // Ask Cloudinary to convert non-raster formats to PNG.
        fetchUrl = url.replace('/upload/', '/upload/f_png/');
      }
      const res = await axios.get(fetchUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      const type = String(res.headers['content-type'] || '');
      if (!type.includes('image/png') && !type.includes('image/jpeg')) {
        return null;
      }
      return Buffer.from(res.data);
    } catch (err: any) {
      this.logger.warn(`Could not load logo image: ${err.message}`);
      return null;
    }
  }

  /**
   * Render a branded PDF receipt. Branding comes from the organization's
   * own logo first, then its hierarchy: department -> faculty -> institution.
   */
  async generateReceiptPdf(
    receiptId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        organization: {
          include: {
            institution: { select: { name: true, logo: true } },
            faculty: { select: { name: true, logo: true } },
            department: { select: { name: true, logo: true } },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const duePayment = await this.prisma.duePayment.findFirst({
      where: { paymentId: receipt.paymentId },
      include: { assignment: { include: { due: true } } },
    });
    const dueName = (duePayment as any)?.assignment?.due?.name;

    const org = receipt.organization as any;
    const brandName = org?.name || receipt.organizationName || 'Heightt';
    const subtitle =
      org?.department?.name || org?.faculty?.name || org?.institution?.name;
    const logoUrl =
      org?.logo ||
      org?.department?.logo ||
      org?.faculty?.logo ||
      org?.institution?.logo;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const rendered = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = 50;
    const right = 545;

    // Header
    if (logoUrl) {
      const img = await this.fetchImageBuffer(logoUrl);
      if (img) {
        try {
          doc.image(img, left, 40, { fit: [80, 80] });
        } catch {
          this.logger.warn('Logo was not embeddable in PDF, skipping');
        }
      }
    }
    const headerTextX = logoUrl ? 145 : left;
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(brandName, headerTextX, 48, { width: right - headerTextX });
    if (subtitle && subtitle !== brandName) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#6B7280')
        .text(subtitle, headerTextX, 72);
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#4F46E5')
      .text('PAYMENT RECEIPT', left, 135, {
        align: 'right',
        width: right - left,
      });

    // Meta box
    const metaTop = 165;
    doc.rect(left, metaTop, right - left, 92).fill('#F3F4F6');
    const label = (t: string, x: number, y: number) =>
      doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text(t, x, y);
    const value = (t: string, x: number, y: number) =>
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(t, x, y + 11);

    const col2 = left + (right - left) / 2 + 10;
    label('RECEIPT NUMBER', left + 14, metaTop + 12);
    value(receipt.receiptNumber, left + 14, metaTop + 12);
    label('PAYMENT DATE', col2, metaTop + 12);
    value(new Date(receipt.paymentDate).toDateString(), col2, metaTop + 12);
    label('REFERENCE', left + 14, metaTop + 48);
    value(receipt.reference || '-', left + 14, metaTop + 48);
    label('METHOD', col2, metaTop + 48);
    value(String(receipt.paymentMethod), col2, metaTop + 48);

    // Payer
    const py = metaTop + 118;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111827')
      .text('Billed To', left, py);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#374151')
      .text(String(receipt.payerName), left, py + 16)
      .text(receipt.payerEmail || '-', left, py + 31);

    // Items table
    const tableTop = py + 60;
    doc.rect(left, tableTop, right - left, 24).fill('#4F46E5');
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#FFFFFF')
      .text('DESCRIPTION', left + 12, tableTop + 8)
      .text('AMOUNT', left + 330, tableTop + 8, { width: 155, align: 'right' });

    let rowY = tableTop + 24;
    const drawRow = (desc: string, amount: string, shaded: boolean) => {
      if (shaded) doc.rect(left, rowY, right - left, 26).fill('#F9FAFB');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#111827')
        .text(desc.slice(0, 70), left + 12, rowY + 9)
        .text(amount, left + 330, rowY + 9, { width: 155, align: 'right' });
      rowY += 26;
    };

    const items = Array.isArray(receipt.items) ? (receipt.items as any[]) : [];
    if (items.length > 0) {
      items.forEach((it, i) =>
        drawRow(
          `${it.name}${Number(it.quantity) > 1 ? ` x${it.quantity}` : ''}`,
          this.formatNaira(Number(it.price) * Number(it.quantity || 1)),
          i % 2 === 1,
        ),
      );
    } else {
      const desc = dueName
        ? `${dueName}${receipt.description ? ` - ${receipt.description}` : ''}`
        : receipt.description || 'Payment';
      drawRow(desc, this.formatNaira(receipt.amount), false);
    }

    // Totals
    let ty = rowY + 18;
    const totalRow = (k: string, v: string, bold = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 12 : 10)
        .fillColor('#111827')
        .text(k, left + 300, ty, { width: 110 })
        .text(v, left + 330, ty, { width: 155, align: 'right' });
      ty += bold ? 20 : 16;
    };
    totalRow('Amount', this.formatNaira(receipt.amount));
    totalRow('Service Fee', this.formatNaira(receipt.serviceFee));
    totalRow('Total Paid', this.formatNaira(receipt.totalAmount), true);

    // Footer
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9CA3AF')
      .text(
        `Status: ${receipt.status}  |  Currency: ${receipt.currency}  |  Generated ${new Date().toISOString()}`,
        left,
        760,
        { width: right - left, align: 'center' },
      )
      .text(
        'This is an electronically generated receipt and does not require a signature.',
        left,
        776,
        { width: right - left, align: 'center' },
      );

    doc.end();
    const buffer = await rendered;
    return { buffer, filename: `${receipt.receiptNumber}.pdf` };
  }

  /**
   * Full delivery pipeline for a receipt:
   * render PDF -> archive to Cloudinary -> link File record -> email payer
   * with the PDF attached (and a download link as fallback).
   */
  async deliverReceiptPdf(receiptId: string): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const { buffer, filename } = await this.generateReceiptPdf(receiptId);

    // Archive the PDF so it stays downloadable even without attachment support.
    let pdfUrl = (receipt.metadata as any)?.pdfUrl as string | undefined;
    if (!pdfUrl) {
      pdfUrl = await this.uploadPdfToCloudinary(buffer, filename).catch(
        (err: any) => {
          this.logger.warn(
            `PDF archival skipped for ${filename}: ${err.message}`,
          );
          return undefined;
        },
      );
      if (pdfUrl) {
        await this.prisma.file.create({
          data: {
            filename,
            originalName: filename,
            mimeType: 'application/pdf',
            size: buffer.length,
            url: pdfUrl,
            publicId: `${receipt.receiptNumber}-${randomBytes(4).toString('hex')}`,
            folder: 'heightt/receipts',
            purpose: 'receipt-pdf',
            userId: receipt.userId,
            organizationId: receipt.organizationId,
            receiptId: receipt.id,
            metadata: { generatedBy: 'receipt-service' },
          },
        });
        await this.prisma.receipt.update({
          where: { id: receipt.id },
          data: {
            metadata: { ...((receipt.metadata as any) || {}), pdfUrl },
          },
        });
      }
    }

    if (!receipt.payerEmail) {
      this.logger.warn(
        `No payer email on receipt ${receipt.receiptNumber}; skipping email`,
      );
      return;
    }

    const html = this.buildReceiptEmailHtml(receipt as any, pdfUrl);
    const sent = await this.emailService.sendEmail(
      receipt.payerEmail,
      `Payment Receipt ${receipt.receiptNumber} - Heightt`,
      html,
      [
        {
          filename,
          contentType: 'application/pdf',
          base64Content: buffer.toString('base64'),
        },
      ],
    );
    if (sent) {
      this.logger.log(
        `📨 Receipt ${receipt.receiptNumber} emailed to ${receipt.payerEmail}`,
      );
    } else {
      this.logger.error(
        `Failed to email receipt ${receipt.receiptNumber} to ${receipt.payerEmail}`,
      );
    }
  }

  /** Stream a receipt PDF for an authorized user (controller download). */
  async getReceiptPdfForUser(
    receiptId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    // Enforces owner-or-admin permission rules.
    await this.getReceiptById(receiptId, userId);
    const result = await this.generateReceiptPdf(receiptId);
    await this.prisma.receipt
      .update({
        where: { id: receiptId },
        data: {
          downloadCount: { increment: 1 },
          lastDownloaded: new Date(),
        },
      })
      .catch(() => null);
    return result;
  }

  private async uploadPdfToCloudinary(
    buffer: Buffer,
    filename: string,
  ): Promise<string> {
    const cloudName = this.configService.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary configuration');
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'heightt/receipts',
          resource_type: 'raw',
          public_id: filename.replace(/\.pdf$/i, ''),
          overwrite: true,
        },
        (err: any, res: any) => (err ? reject(err) : resolve(res)),
      );
      stream.end(buffer);
    });
    return result.secure_url;
  }

  private buildReceiptEmailHtml(receipt: any, pdfUrl?: string): string {
    const money = (k: number) => this.formatNaira(k);
    return renderHeighttEmail({
      preheader: `Your Heightt payment receipt ${receipt.receiptNumber} is ready.`,
      category: 'Payment successful',
      headline: 'Your payment receipt is ready',
      recipientName: receipt.payerName,
      intro: `Your payment was successful. Receipt ${receipt.receiptNumber} is attached as a PDF.`,
      details: [
        { label: 'Transaction reference', value: receipt.reference },
        { label: 'Payment', value: receipt.description || 'Payment' },
        { label: 'Amount', value: money(receipt.amount) },
        { label: 'Service fee', value: money(receipt.serviceFee) },
        {
          label: 'Total paid',
          value: `${money(receipt.totalAmount)} ${receipt.currency}`,
        },
      ],
      actionLabel: pdfUrl ? 'Download receipt' : undefined,
      actionUrl: pdfUrl,
      notice:
        'This receipt was generated automatically by Heightt. Keep it for your financial records.',
      tone: 'success',
      reason:
        'You received this email because a payment was recorded on your Heightt account.',
    });
  }
}
