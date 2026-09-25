import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from './approvals.service';
import { SelfServiceOrganizationDto } from './self-service.dto';

const ORG_PERMISSIONS = [
  'users:read',
  'organization:read',
  'organization:update',
  'organization:manage',
  'finance:read',
  'finance:due:create',
  'finance:due:assign',
  'finance:due:view',
  'finance:due:delete',
  'communication:create',
  'student:read',
];

@Injectable()
export class SelfServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
  ) {}

  async organization(userId: string, dto: SelfServiceOrganizationDto) {
    await this.assertEligible(userId);
    await this.validateHierarchy(dto);

    const nameNormalized = this.normalize(dto.name);
    const existing = await this.findExisting(nameNormalized, dto.institutionId);
    if (existing) {
      throw new ConflictException({
        message: 'Organization already exists',
        existingEntityId: existing.id,
        existingOrganizationSlug: existing.slug,
      });
    }

    const baseSlug = this.slug(dto.name);
    const slugCount = await this.prisma.organization.count({
      where: {
        institutionId: dto.institutionId || null,
        slug: { startsWith: baseSlug },
      },
    });
    const slug = slugCount ? `${baseSlug}-${slugCount + 1}` : baseSlug;

    try {
      const entity = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            ...dto,
            name: dto.name.trim(),
            nameNormalized,
            slug,
            createdBy: userId,
            status: 'DRAFT',
          },
        });
        await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId,
            membershipType: 'ADMIN',
            status: 'ACTIVE',
            joinedAt: new Date(),
            isPrimary: false,
          },
        });
        const admin = await tx.admin.create({
          data: {
            userId,
            adminType: 'ORGANIZATION_ADMIN',
            organizationId: organization.id,
            institutionId: organization.institutionId,
            facultyId: organization.facultyId,
            departmentId: organization.departmentId,
            assignedBy: userId,
            status: 'INACTIVE',
          },
        });
        await tx.adminPermission.createMany({
          data: ORG_PERMISSIONS.map((permissionKey) => ({
            adminId: admin.id,
            permissionKey,
            permissionCategory: 'SYSTEM' as const,
            permissionAction: 'MANAGE' as const,
            grantedBy: userId,
            grantedAt: new Date(),
          })),
        });
        const wallet = await tx.wallet.create({
          data: { organizationId: organization.id },
        });
        const ledger = await tx.ledgerAccount.create({
          data: {
            organizationId: organization.id,
            code: `ORG-WALLET-${wallet.id.slice(0, 8)}`,
            name: `${organization.name} Wallet`,
            type: 'ASSET',
            category: 'CASH',
            ownerType: 'ORGANIZATION',
            ownerId: organization.id,
            walletId: wallet.id,
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { ledgerAccountId: ledger.id },
        });
        return organization;
      });

      const approval = await this.approvals.submit(
        'ORGANIZATION',
        entity.id,
        entity.name,
        userId,
      );
      return { entity, approval };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.findExisting(
          nameNormalized,
          dto.institutionId,
        );
        throw new ConflictException({
          message: 'Organization already exists',
          existingEntityId: duplicate?.id ?? null,
          existingOrganizationSlug: duplicate?.slug ?? null,
        });
      }
      throw error;
    }
  }

  private async assertEligible(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('An active account is required');
    }
    if (!user.emailVerified) {
      throw new BadRequestException(
        'Verify your email before creating an organization',
      );
    }
    if (!user.profile?.onboardingCompleted) {
      throw new BadRequestException(
        'Complete onboarding before creating an organization',
      );
    }
  }

  private async validateHierarchy(dto: SelfServiceOrganizationDto) {
    if (!dto.institutionId && dto.scope !== 'CUSTOM') {
      throw new BadRequestException(
        'An institution is required for this organization scope',
      );
    }
    if (dto.institutionId) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: dto.institutionId, status: 'ACTIVE', deletedAt: null },
      });
      if (!institution) {
        throw new NotFoundException('Approved institution not found');
      }
    }
    if (dto.facultyId) {
      const faculty = await this.prisma.faculty.findFirst({
        where: {
          id: dto.facultyId,
          institutionId: dto.institutionId,
          status: 'ACTIVE',
        },
      });
      if (!faculty) {
        throw new BadRequestException(
          'Faculty does not belong to the approved institution',
        );
      }
    }
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          facultyId: dto.facultyId,
          status: 'ACTIVE',
        },
      });
      if (!department) {
        throw new BadRequestException(
          'Department does not belong to the approved faculty',
        );
      }
    }
  }

  private findExisting(nameNormalized: string, institutionId?: string) {
    return this.prisma.organization.findFirst({
      where: {
        institutionId: institutionId || null,
        nameNormalized,
        deletedAt: null,
      },
      select: { id: true, slug: true },
    });
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private slug(value: string) {
    return (
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'organization'
    );
  }

  private isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
