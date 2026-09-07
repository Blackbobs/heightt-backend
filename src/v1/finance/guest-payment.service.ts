import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { renderHeighttEmail } from '../../email/heightt-email.template';
import { BachsService } from '../bachs/bachs.service';
import { CreateGuestPaymentDto } from './dto';

@Injectable()
export class GuestPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bachsService: BachsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private codeHash(code: string, userId: string) {
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'heightt-claim-code';
    return createHmac('sha256', secret)
      .update(`${userId}:${code}`)
      .digest('hex');
  }

  async listInstitutions() {
    return this.prisma.institution.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true, shortName: true, code: true, logo: true },
      orderBy: { name: 'asc' },
    });
  }

  async listFaculties(institutionId: string) {
    return this.prisma.faculty.findMany({
      where: { institutionId, status: 'ACTIVE' },
      select: { id: true, institutionId: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async listDepartments(facultyId: string) {
    return this.prisma.department.findMany({
      where: { facultyId, status: 'ACTIVE' },
      select: { id: true, facultyId: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async listAcademicLevels(filters: {
    institutionId: string;
    facultyId?: string;
    departmentId?: string;
  }) {
    return this.prisma.academicLevel.findMany({
      where: {
        status: 'ACTIVE',
        department: {
          status: 'ACTIVE',
          faculty: {
            status: 'ACTIVE',
            institutionId: filters.institutionId,
            ...(filters.facultyId ? { id: filters.facultyId } : {}),
          },
          ...(filters.departmentId ? { id: filters.departmentId } : {}),
        },
      },
      select: {
        id: true,
        name: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async listDues(filters: {
    institutionId: string;
    facultyId?: string;
    departmentId?: string;
    organizationId?: string;
    academicLevelId?: string;
  }) {
    if (!filters.academicLevelId) return [];
    const level = await this.prisma.academicLevel.findFirst({
      where: {
        id: filters.academicLevelId,
        status: 'ACTIVE',
        department: {
          ...(filters.departmentId ? { id: filters.departmentId } : {}),
          faculty: {
            institutionId: filters.institutionId,
            ...(filters.facultyId ? { id: filters.facultyId } : {}),
          },
        },
      },
    });
    if (!level || (level.numericLevel !== 100 && level.numericLevel < 200))
      return [];
    return this.prisma.due.findMany({
      where: {
        status: 'ACTIVE',
        isFresher: level.numericLevel === 100,
        organization: {
          status: 'ACTIVE',
          deletedAt: null,
          institutionId: filters.institutionId,
          ...(filters.facultyId ? { facultyId: filters.facultyId } : {}),
          ...(filters.departmentId
            ? { departmentId: filters.departmentId }
            : {}),
          ...(filters.organizationId ? { id: filters.organizationId } : {}),
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        amount: true,
        isRequired: true,
        isFresher: true,
        session: { select: { id: true, name: true } },
        organization: {
          select: { id: true, name: true, type: true, scope: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async initiate(dto: CreateGuestPaymentDto) {
    const academicLevel = dto.academicLevelId
      ? await this.prisma.academicLevel.findFirst({
          where: {
            id: dto.academicLevelId,
            status: 'ACTIVE',
            department: {
              status: 'ACTIVE',
              faculty: {
                status: 'ACTIVE',
                institutionId: dto.institutionId,
                ...(dto.facultyId ? { id: dto.facultyId } : {}),
              },
              ...(dto.departmentId ? { id: dto.departmentId } : {}),
            },
          },
        })
      : null;
    if (dto.academicLevelId && !academicLevel) {
      throw new BadRequestException(
        'Academic level does not match the selected academic scope',
      );
    }

    const due = await this.prisma.due.findFirst({
      where: { id: dto.dueId, status: 'ACTIVE' },
      include: { organization: true },
    });
    if (!due || due.organization.status !== 'ACTIVE') {
      throw new NotFoundException('Active due not found');
    }
    if (
      !academicLevel ||
      (due.isFresher
        ? academicLevel.numericLevel !== 100
        : academicLevel.numericLevel < 200)
    ) {
      throw new ForbiddenException(
        'This due is not available for your academic level',
      );
    }
    if (
      due.organizationId !== due.organization.id ||
      due.organization.institutionId !== dto.institutionId ||
      (dto.facultyId && due.organization.facultyId !== dto.facultyId) ||
      (dto.departmentId &&
        due.organization.departmentId !== dto.departmentId) ||
      (due.organization.academicLevelId &&
        due.organization.academicLevelId !== dto.academicLevelId)
    ) {
      throw new BadRequestException(
        'Due does not match the selected academic scope',
      );
    }

    const email = this.normalizeEmail(dto.email);
    const accessToken = randomBytes(32).toString('hex');
    const suffix = randomBytes(12).toString('hex');
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const guest = await this.prisma.$transaction(async (tx) => {
      const placeholder = await tx.user.create({
        data: {
          email: `guest_${suffix}@guest.heightt.invalid`,
          username: `guest_${suffix}`,
          passwordHash,
          status: 'ACTIVE',
          emailVerified: false,
        },
      });
      return tx.guestPayer.create({
        data: {
          email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim(),
          matricNumber: dto.matricNumber?.trim(),
          institutionId: dto.institutionId,
          facultyId: dto.facultyId,
          departmentId: dto.departmentId,
          academicLevelId: dto.academicLevelId,
          placeholderUserId: placeholder.id,
          accessTokenHash: this.tokenHash(accessToken),
        },
      });
    });

    const result = await this.bachsService.initiatePayment(
      guest.placeholderUserId,
      {
        userId: guest.placeholderUserId,
        organizationId: due.organizationId,
        amount: due.amount,
        paymentMethod: dto.paymentMethod,
        description: due.name,
        category: 'DUE',
        customer: {
          email,
          name: `${guest.firstName} ${guest.lastName}`,
          phone: guest.phone || undefined,
        },
        metadata: {
          guestPayerId: guest.id,
          guestEmail: email,
          guestName: `${guest.firstName} ${guest.lastName}`,
          guestPhone: guest.phone,
          guestMatricNumber: guest.matricNumber,
          guestDueId: due.id,
        },
      },
      dto.successUrl,
      dto.cancelUrl,
    );

    return { ...result, accessToken, guestPayerId: guest.id };
  }

  async status(pendingPaymentId: string, accessToken: string) {
    const guest = await this.prisma.guestPayer.findFirst({
      where: {
        accessTokenHash: this.tokenHash(accessToken),
        placeholderUser: {
          pendingPayments: { some: { id: pendingPaymentId } },
        },
      },
    });
    if (!guest)
      throw new ForbiddenException('Invalid guest payment access token');
    return this.bachsService.getPendingPaymentStatus(
      pendingPaymentId,
      guest.placeholderUserId,
    );
  }

  async requestClaimCode(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.emailVerified) {
      throw new ForbiddenException(
        'Verify your account email before claiming payments',
      );
    }
    const email = this.normalizeEmail(user.email);
    const guests = await this.prisma.guestPayer.findMany({
      where: { email, claimedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    // Always return a neutral response so this endpoint does not disclose records.
    if (!guests.length)
      return { message: 'If matching payments exist, a code has been sent' };

    const recent = await this.prisma.guestClaimCode.findFirst({
      where: {
        guestPayerId: guests[0].id,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recent) {
      throw new HttpException(
        'Wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const createdClaim = await this.prisma.guestClaimCode.create({
      data: {
        guestPayerId: guests[0].id,
        codeHash: this.codeHash(code, user.id),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const sent = await this.emailService.sendEmail(
      email,
      'Claim your guest payments - Heightt',
      renderHeighttEmail({
        preheader: 'Your one-time payment claim code.',
        category: 'Payment history',
        headline: 'Claim your guest payments',
        recipientName: user.username,
        intro:
          'Enter this code while signed in to attach your earlier guest payments to your account.',
        details: [{ label: 'Claim code', value: code }],
        notice: 'This code expires in 10 minutes and can only be used once.',
        reason:
          'You requested to claim guest payments made with this email address.',
      }),
    );
    if (!sent) {
      await this.prisma.guestClaimCode.delete({
        where: { id: createdClaim.id },
      });
      throw new BadRequestException('Unable to send claim code');
    }
    return { message: 'If matching payments exist, a code has been sent' };
  }

  async verifyClaimCode(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });
    if (!user || !user.emailVerified)
      throw new ForbiddenException('Verified account required');
    const email = this.normalizeEmail(user.email);
    const submittedHash = this.codeHash(code, user.id);
    const claim = await this.prisma.guestClaimCode.findFirst({
      where: {
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
        guestPayer: { email, claimedAt: null },
      },
      include: { guestPayer: true },
      orderBy: { createdAt: 'desc' },
    });
    const validCode =
      claim &&
      timingSafeEqual(
        Buffer.from(claim.codeHash, 'hex'),
        Buffer.from(submittedHash, 'hex'),
      );
    if (!claim || !validCode) {
      if (claim) {
        await this.prisma.guestClaimCode.update({
          where: { id: claim.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new BadRequestException('Invalid or expired claim code');
    }

    const guests = await this.prisma.guestPayer.findMany({
      where: { email, claimedAt: null },
    });
    let paymentCount = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const guest of guests) {
        const payments = await tx.payment.findMany({
          where: { payerId: guest.placeholderUserId },
        });
        paymentCount += payments.length;
        await tx.payment.updateMany({
          where: { payerId: guest.placeholderUserId },
          data: { payerId: user.id },
        });
        await tx.pendingPayment.updateMany({
          where: { userId: guest.placeholderUserId },
          data: { userId: user.id },
        });
        await tx.receipt.updateMany({
          where: { userId: guest.placeholderUserId },
          data: { userId: user.id },
        });

        if (user.studentProfile) {
          for (const payment of payments.filter(
            (p) => p.status === 'COMPLETED',
          )) {
            const dueId = (payment.metadata as any)?.guestDueId;
            if (!dueId) continue;
            const due = await tx.due.findUnique({ where: { id: dueId } });
            if (!due || due.organizationId !== payment.organizationId) continue;
            const assignment = await tx.dueAssignment.upsert({
              where: {
                dueId_studentId: { dueId, studentId: user.studentProfile.id },
              },
              create: {
                dueId,
                studentId: user.studentProfile.id,
                amount: due.amount,
                isPaid: true,
                paidAt: payment.paidAt || new Date(),
              },
              update: { isPaid: true, paidAt: payment.paidAt || new Date() },
            });
            const existingDuePayment = await tx.duePayment.findUnique({
              where: { assignmentId: assignment.id },
            });
            if (!existingDuePayment) {
              await tx.duePayment.create({
                data: {
                  assignmentId: assignment.id,
                  paymentId: payment.id,
                  amount: payment.amount,
                  paidAt: payment.paidAt || new Date(),
                },
              });
            }
          }
        }
        await tx.guestPayer.update({
          where: { id: guest.id },
          data: { claimedById: user.id, claimedAt: new Date() },
        });
      }
      await tx.guestClaimCode.update({
        where: { id: claim.id },
        data: { usedAt: new Date() },
      });
    });
    return {
      claimedGuestRecords: guests.length,
      claimedPayments: paymentCount,
    };
  }
}
