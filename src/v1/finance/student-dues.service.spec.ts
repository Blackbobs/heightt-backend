jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService student dues across academic sessions', () => {
  function createService(prisma: any) {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    (service as any).prisma = prisma;
    (service as any).logger = { log: jest.fn() };
    return service;
  }

  it('returns an assigned unpaid previous-session due as payable arrears', async () => {
    const previousDue = {
      id: 'due-old',
      organizationId: 'old-organization',
      sessionId: 'session-2026',
      name: '2026 Faculty Levy',
      amount: 50_000,
      status: 'ACTIVE',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      organization: { id: 'old-organization', name: 'Engineering Faculty' },
      session: {
        id: 'session-2026',
        name: '2026/2027',
        status: 'COMPLETED',
        isCurrent: false,
      },
    };
    const assignment = {
      id: 'assignment-old',
      dueId: previousDue.id,
      studentId: 'student-1',
      amount: previousDue.amount,
      isPaid: false,
      paidAt: null,
      createdAt: previousDue.createdAt,
      updatedAt: previousDue.updatedAt,
      due: previousDue,
    };
    const prisma = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-1',
          institutionId: 'institution-1',
        }),
      },
      organizationMembership: { findMany: jest.fn().mockResolvedValue([]) },
      academicSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-2027',
          name: '2027/2028',
        }),
      },
      due: { findMany: jest.fn() },
      dueAssignment: { findMany: jest.fn().mockResolvedValue([assignment]) },
    };
    const service = createService(prisma);

    const result = await service.getMyDues('user-1');

    expect(prisma.due.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'assignment-old',
        sessionCategory: 'PREVIOUS',
        isOutstanding: true,
        isArrear: true,
        canPay: true,
        isAutoAssigned: false,
      }),
    ]);
  });

  it('allows an existing old-session assignment without active membership', async () => {
    const prisma = {
      dueAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-old',
          amount: 50_000,
          isPaid: false,
          student: { userId: 'user-1' },
          due: { status: 'ACTIVE' },
          duePayments: [],
        }),
      },
      organizationMembership: { findFirst: jest.fn() },
    };
    const service = createService(prisma);

    await expect(
      service.resolveDueAssignment(
        'user-1',
        undefined,
        'assignment-old',
        50_000,
      ),
    ).resolves.toBe('assignment-old');
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('does not auto-assign an unassigned due from a closed session', async () => {
    const prisma = {
      due: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'due-old',
          organizationId: 'old-organization',
          sessionId: 'session-2026',
          amount: 50_000,
          status: 'ACTIVE',
        }),
      },
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
      },
      dueAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      academicSession: {
        findUnique: jest.fn().mockResolvedValue({
          isCurrent: false,
          status: 'COMPLETED',
        }),
      },
      organizationMembership: { findFirst: jest.fn() },
    };
    const service = createService(prisma);

    await expect(
      service.resolveDueAssignment('user-1', 'due-old', undefined, 50_000),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
