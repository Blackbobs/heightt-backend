jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { BankAccountService } from './bank-account.service';
import { FinanceService } from './finance.service';

describe('Sensitive financial data soft deletion', () => {
  it('soft-deletes a due and records the actor without removing the row', async () => {
    const prisma: any = {
      due: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'due-1',
          name: 'Department due',
          organizationId: 'org-1',
        }),
        update: jest.fn().mockReturnValue({ operation: 'update' }),
        delete: jest.fn(),
      },
      duePayment: { count: jest.fn().mockResolvedValue(0) },
      pendingPayment: { count: jest.fn().mockResolvedValue(0) },
      activityLog: { create: jest.fn().mockReturnValue({ operation: 'log' }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = Object.create(FinanceService.prototype) as FinanceService;
    Object.assign(service, { prisma, logger: { log: jest.fn() } });

    await service.deleteDue('admin-1', 'due-1');

    expect(prisma.due.update).toHaveBeenCalledWith({
      where: { id: 'due-1' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        deletedAt: expect.any(Date),
        deletedBy: 'admin-1',
      }),
    });
    expect(prisma.due.delete).not.toHaveBeenCalled();
  });

  it('soft-deletes a bank account and writes an activity log', async () => {
    const prisma: any = {
      bankAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'bank-1',
          userId: 'user-1',
          isDefault: false,
        }),
        update: jest.fn().mockReturnValue({ operation: 'update' }),
        delete: jest.fn(),
      },
      activityLog: { create: jest.fn().mockReturnValue({ operation: 'log' }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const cacheService = { delete: jest.fn() };
    const service = new BankAccountService(
      prisma,
      cacheService as any,
      {} as any,
    );

    await service.deleteBankAccount('bank-1', 'user-1');

    expect(prisma.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 'bank-1' },
      data: expect.objectContaining({
        isDefault: false,
        deletedAt: expect.any(Date),
        deletedBy: 'user-1',
      }),
    });
    expect(prisma.activityLog.create).toHaveBeenCalled();
    expect(prisma.bankAccount.delete).not.toHaveBeenCalled();
  });
});
