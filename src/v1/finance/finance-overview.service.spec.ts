jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinanceService } from './finance.service';

describe('FinanceService organization overview', () => {
  it('returns organization wallet, collection, pending, and due totals', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    (service as any).walletService = {
      getOrCreateWallet: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        balance: 50_000,
        heldBalance: 5_000,
        currency: 'NGN',
        status: 'ACTIVE',
      }),
    };
    (service as any).prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          name: 'Engineering Students',
          type: 'DEPARTMENT',
          status: 'ACTIVE',
        }),
      },
      transaction: { count: jest.fn().mockResolvedValue(12) },
      payment: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 10 },
          _sum: { amount: 50_000, serviceFee: 1_000 },
        }),
      },
      pendingPayment: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 2 },
          _sum: { amount: 8_000 },
        }),
      },
      due: {
        count: jest.fn().mockResolvedValue(3),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 15_000 } }),
      },
      dueAssignment: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 20 },
          _sum: { amount: 100_000 },
        }),
        count: jest.fn().mockResolvedValue(10),
      },
      duePayment: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 10 },
          _sum: { amount: 50_000 },
        }),
      },
    };

    const result = await service.getOrganizationFinanceOverview('org-1');

    expect(result.wallet.availableBalance).toBe(45_000);
    expect(result.transactions.total).toBe(12);
    expect(result.currencyUnit).toBe('KOBO');
    expect(result.collections).toMatchObject({
      totalAmount: 50_000,
      completedCount: 10,
      serviceFees: 1_000,
      pendingAmount: 8_000,
      pendingCount: 2,
    });
    expect(result.dues).toMatchObject({
      createdCount: 3,
      faceValue: 15_000,
      assignedCount: 20,
      totalExpected: 100_000,
      totalCollected: 50_000,
      completedPayments: 10,
      pendingAssignments: 10,
    });
  });
});
