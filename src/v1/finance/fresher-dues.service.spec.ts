jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { validate } from 'class-validator';
import { CreateDueDto } from './dto/create-due.dto';
import { FinanceService } from './finance.service';

function serviceWith(prisma: any) {
  const service = Object.create(FinanceService.prototype) as FinanceService;
  Object.assign(service, { prisma, logger: { log: jest.fn() } });
  return service;
}

describe('Fresher dues eligibility', () => {
  it.each([100, 200, 300, 600])(
    'filters both available and assigned dues at level %s',
    async (numericLevel) => {
      const prisma = {
        studentProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'student',
            institutionId: 'institution',
            currentAcademicLevel: { numericLevel },
          }),
        },
        organizationMembership: {
          findMany: jest.fn().mockResolvedValue([{ organizationId: 'org' }]),
        },
        academicSession: {
          findFirst: jest.fn().mockResolvedValue({ id: 'session' }),
        },
        due: { findMany: jest.fn().mockResolvedValue([]) },
        dueAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      };
      await serviceWith(prisma).getMyDues('user');
      expect(prisma.due.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isFresher: numericLevel === 100 }),
        }),
      );
      expect(prisma.dueAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due: { isFresher: numericLevel === 100 },
          }),
        }),
      );
    },
  );

  it.each([null, { numericLevel: 0 }])(
    'returns no dues for an unknown or unsupported level %j',
    async (currentAcademicLevel) => {
      const prisma = {
        studentProfile: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'student', currentAcademicLevel }),
        },
      };
      expect(await serviceWith(prisma).getMyDues('user')).toEqual([]);
    },
  );

  it.each([
    [true, 200],
    [false, 100],
    [false, undefined],
    [true, undefined],
  ])(
    'rejects payment by assignment for isFresher=%s at level %s',
    async (isFresher, numericLevel) => {
      const prisma = {
        dueAssignment: {
          findUnique: jest.fn().mockResolvedValue({
            student: {
              userId: 'user',
              currentAcademicLevel:
                numericLevel === undefined ? null : { numericLevel },
            },
            due: { isFresher, status: 'ACTIVE' },
            duePayments: [],
            isPaid: false,
          }),
        },
      };
      await expect(
        serviceWith(prisma).resolveDueAssignment(
          'user',
          undefined,
          'assignment',
        ),
      ).rejects.toThrow('This due is not available for your academic level');
    },
  );

  it.each([
    [true, 100],
    [false, 200],
    [false, 600],
  ])(
    'allows matching assignment payments for isFresher=%s at level %s',
    async (isFresher, numericLevel) => {
      const prisma = {
        dueAssignment: {
          findUnique: jest.fn().mockResolvedValue({
            student: {
              userId: 'user',
              currentAcademicLevel: { numericLevel },
            },
            due: { isFresher, status: 'ACTIVE' },
            duePayments: [],
            isPaid: false,
          }),
        },
      };
      await expect(
        serviceWith(prisma).resolveDueAssignment(
          'user',
          undefined,
          'assignment',
        ),
      ).resolves.toBe('assignment');
    },
  );

  it('rejects auto-assignment payment for the wrong level', async () => {
    const prisma = {
      due: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isFresher: true, status: 'ACTIVE' }),
      },
      studentProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ currentAcademicLevel: { numericLevel: 200 } }),
      },
      dueAssignment: { create: jest.fn() },
    };
    await expect(
      serviceWith(prisma).resolveDueAssignment('user', 'due'),
    ).rejects.toThrow('This due is not available for your academic level');
    expect(prisma.dueAssignment.create).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined])(
    'persists creation with isFresher=%s',
    async (isFresher) => {
      const prisma = {
        organization: {
          findUnique: jest.fn().mockResolvedValue({ id: 'org' }),
        },
        due: {
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ id: 'due', ...data })),
        },
        activityLog: { create: jest.fn() },
      };
      const service = serviceWith(prisma);
      Object.assign(service, {
        walletService: { getOrCreateWallet: jest.fn() },
      });
      expect(
        await service.createDue('admin', {
          organizationId: 'org',
          name: 'Dues',
          amount: 100,
          isFresher,
        }),
      ).toEqual(expect.objectContaining({ isFresher: isFresher ?? false }));
    },
  );

  it('rejects assignment when none of the selected students match the audience', async () => {
    const prisma = {
      due: { findUnique: jest.fn().mockResolvedValue({ isFresher: true }) },
      studentProfile: { findMany: jest.fn().mockResolvedValue([]) },
      dueAssignment: { createManyAndReturn: jest.fn() },
    };
    await expect(
      serviceWith(prisma).assignDueToStudents('admin', 'due', {
        studentIds: ['student'],
      }),
    ).rejects.toThrow('No students found to assign due');
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['student'] },
          currentAcademicLevel: { numericLevel: 100 },
        },
      }),
    );
    expect(prisma.dueAssignment.createManyAndReturn).not.toHaveBeenCalled();
  });

  it.each(['true', 'false', 1, 0])(
    'rejects non-boolean isFresher=%s',
    async (isFresher) => {
      const dto = Object.assign(new CreateDueDto(), {
        organizationId: 'org',
        name: 'Dues',
        amount: 100,
        isFresher,
      });
      expect(
        (await validate(dto)).some((error) => error.property === 'isFresher'),
      ).toBe(true);
    },
  );
});
