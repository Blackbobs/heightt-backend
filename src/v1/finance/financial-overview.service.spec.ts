jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinanceService } from './finance.service';

describe('FinanceService financial overview', () => {
  it('returns platform service-fee earnings separately from organization balances', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    (service as any).KOBO_PER_NAIRA = 100;
    (service as any).prisma = {
      wallet: {
        findMany: jest.fn().mockResolvedValue([
          { balance: 100_000, heldBalance: 5_000 },
          { balance: 50_000, heldBalance: 0 },
        ]),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      due: { count: jest.fn().mockResolvedValue(2) },
      dueAssignment: {
        count: jest.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(2),
      },
      transaction: { count: jest.fn().mockResolvedValue(4) },
      journalLine: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 12_345 } }),
      },
    };

    const result = await service.getFinancialOverview('institution-1');

    expect(result.totalBalance).toBe(150_000);
    expect(result.platformEarnings).toEqual({
      amount: 12_345,
      amountFormatted: '₦123.45',
      currency: 'NGN',
      currencyUnit: 'KOBO',
    });
    expect((service as any).prisma.journalLine.aggregate).toHaveBeenCalledWith({
      where: {
        type: 'CREDIT',
        description: {
          in: ['Platform service fee', 'Heightt platform service fee'],
        },
        journalEntry: {
          payment: {
            status: 'COMPLETED',
            organization: { institutionId: 'institution-1' },
          },
        },
      },
      _sum: { amount: true },
    });
  });
});
