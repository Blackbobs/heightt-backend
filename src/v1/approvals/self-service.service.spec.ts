import { BadRequestException } from '@nestjs/common';
import { SelfServiceService } from './self-service.service';

function createFixture(onboardingCompleted = true) {
  const transaction = {
    organization: {
      create: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Builders Club',
        slug: 'builders-club',
        institutionId: null,
        facultyId: null,
        departmentId: null,
      }),
    },
    organizationMembership: { create: jest.fn().mockResolvedValue({}) },
    admin: {
      create: jest.fn().mockResolvedValue({ id: 'admin-1' }),
    },
    adminPermission: { createMany: jest.fn().mockResolvedValue({ count: 11 }) },
    wallet: {
      create: jest.fn().mockResolvedValue({ id: 'wallet-12345678' }),
      update: jest.fn().mockResolvedValue({}),
    },
    ledgerAccount: { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        emailVerified: true,
        profile: { onboardingCompleted },
      }),
    },
    institution: { findFirst: jest.fn() },
    faculty: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    organization: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (callback) => callback(transaction)),
  };
  const approvals = {
    submit: jest.fn().mockResolvedValue({
      id: 'approval-1',
      status: 'PENDING',
    }),
  };
  const service = new SelfServiceService(prisma as never, approvals as never);
  return { service, prisma, approvals, transaction };
}

describe('SelfServiceService organization requests', () => {
  it('preserves onboarding membership and gates creator admin access', async () => {
    const { service, approvals, transaction } = createFixture();

    const result = await service.organization('user-1', {
      name: 'Builders Club',
      type: 'CLUB',
      scope: 'CUSTOM',
    });

    expect(transaction.organizationMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        membershipType: 'ADMIN',
        status: 'ACTIVE',
        isPrimary: false,
      }),
    });
    expect(transaction.admin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        adminType: 'ORGANIZATION_ADMIN',
        status: 'INACTIVE',
      }),
    });
    expect(approvals.submit).toHaveBeenCalledWith(
      'ORGANIZATION',
      'org-1',
      'Builders Club',
      'user-1',
    );
    expect(result.approval.status).toBe('PENDING');
  });

  it('requires completed onboarding', async () => {
    const { service, prisma } = createFixture(false);

    await expect(
      service.organization('user-1', {
        name: 'Builders Club',
        type: 'CLUB',
        scope: 'CUSTOM',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
