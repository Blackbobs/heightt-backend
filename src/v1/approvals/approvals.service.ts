import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';
import { renderHeighttEmail } from '../../email/heightt-email.template';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApprovalEntityType,
  ApprovalRequestStatus,
} from '../generated/prisma/enums';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async submit(
    entityType: ApprovalEntityType,
    entityId: string,
    entityName: string,
    submittedBy: string,
  ) {
    const request = await this.prisma.approvalRequest.create({
      data: { entityType, entityId, entityName, submittedBy },
    });
    const admins = await this.prisma.admin.findMany({
      where: { adminType: 'PLATFORM_ADMIN', status: 'ACTIVE' },
      select: { user: { select: { email: true, username: true } } },
    });
    const dashboardUrl = this.adminDashboardUrl();
    await Promise.allSettled(
      admins.map(({ user }) =>
        this.emailService.sendEmail(
          user.email,
          `New ${entityType.toLowerCase()} awaiting approval`,
          renderHeighttEmail({
            preheader: `${entityName} is awaiting platform review.`,
            category: 'Platform review',
            headline: 'A new organisation needs approval',
            recipientName: user.username,
            intro: `${entityName} was submitted and is not publicly visible yet.`,
            details: [
              { label: 'Type', value: entityType },
              { label: 'Submitted name', value: entityName },
            ],
            actionLabel: 'Review submission',
            actionUrl: dashboardUrl,
            reason:
              'You received this email because you are a Heightt platform administrator.',
          }),
        ),
      ),
    );
    return request;
  }

  list(status: ApprovalRequestStatus = 'PENDING') {
    return this.prisma.approvalRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(
    id: string,
    reviewerId: string,
    status: Extract<ApprovalRequestStatus, 'APPROVED' | 'REJECTED'>,
    rejectionReason?: string,
  ) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        'Approval request has already been reviewed',
      );
    }
    if (status === 'REJECTED' && !rejectionReason?.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    await this.prisma.$transaction(async (tx) => {
      const data =
        status === 'APPROVED' ? this.approvedState() : this.rejectedState();
      await this.updateEntity(tx, request.entityId, data);
      await tx.admin.updateMany({
        where: { organizationId: request.entityId },
        data:
          status === 'APPROVED'
            ? { status: 'ACTIVE', revokedAt: null, revokedReason: null }
            : {
                status: 'REVOKED',
                revokedAt: new Date(),
                revokedReason: rejectionReason!.trim(),
              },
      });
      await tx.approvalRequest.update({
        where: { id },
        data: {
          status,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          rejectionReason:
            status === 'REJECTED' ? rejectionReason!.trim() : null,
        },
      });
    });

    const creator = await this.prisma.user.findUnique({
      where: { id: request.submittedBy },
      select: { email: true, username: true },
    });
    if (creator) {
      await this.emailService.sendEmail(
        creator.email,
        `${request.entityName} was ${status.toLowerCase()}`,
        renderHeighttEmail({
          preheader: `Your submission was ${status.toLowerCase()}.`,
          category: 'Organisation review',
          headline:
            status === 'APPROVED'
              ? 'Your organisation was approved'
              : 'Your submission needs attention',
          recipientName: creator.username,
          intro:
            status === 'APPROVED'
              ? `${request.entityName} is now approved and publicly available.`
              : `${request.entityName} was not approved.`,
          body: status === 'REJECTED' ? rejectionReason : undefined,
          actionLabel:
            status === 'APPROVED' ? 'Open admin dashboard' : undefined,
          actionUrl:
            status === 'APPROVED' ? this.adminDashboardUrl() : undefined,
          tone: status === 'APPROVED' ? 'success' : 'warning',
          reason:
            'You received this email because you submitted an organisation on Heightt.',
        }),
      );
    }
    return this.prisma.approvalRequest.findUnique({ where: { id } });
  }

  private adminDashboardUrl() {
    const configured = this.configService.get<string>('ADMIN_APP_URL');
    if (configured) return configured.replace(/\/$/, '');
    return process.env.NODE_ENV === 'production'
      ? 'https://admin.heightt.app'
      : 'https://admin-preview.heightt.app';
  }

  private approvedState() {
    return { status: 'ACTIVE' as const, activatedAt: new Date() };
  }

  private rejectedState() {
    return {
      status: 'ARCHIVED' as const,
      archivedAt: new Date(),
      deletedAt: new Date(),
    };
  }

  private updateEntity(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    id: string,
    data: object,
  ) {
    return tx.organization.update({ where: { id }, data });
  }
}
