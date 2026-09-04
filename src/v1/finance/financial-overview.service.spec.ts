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
      withdrawal: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: 2_000, fee: 50 },
          _count: { _all: 1 },
        }),
      },
    };

    const result = await service.getFinancialOverview();

    expect(result.totalBalance).toBe(150_000);
    expect(result.platformEarnings).toEqual({
      amount: 10_295,
      amountFormatted: '₦102.95',
      grossAmount: 12_345,
      grossAmountFormatted: '₦123.45',
      withdrawnAmount: 2_000,
      withdrawnAmountFormatted: '₦20.00',
      payoutProviderFees: 50,
      payoutProviderFeesFormatted: '₦0.50',
      withdrawalCount: 1,
      currency: 'NGN',
      currencyUnit: 'KOBO',
      scope: 'PLATFORM_NET',
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
            organization: {},
          },
        },
      },
      _sum: { amount: true },
    });
    expect((service as any).prisma.withdrawal.aggregate).toHaveBeenCalledWith({
      where: {
        status: { in: ['PROCESSING', 'COMPLETED'] },
        metadata: { path: ['type'], equals: 'PLATFORM_WITHDRAWAL' },
      },
      _sum: { amount: true, fee: true },
      _count: { _all: true },
    });
  });

  it('does not apply Heightt withdrawal charges to platform payouts', () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    expect(
      (service as any).calculatePlatformWithdrawalCharges(100_000),
    ).toEqual({ fee: 10_000, netAmount: 100_000, totalCharges: 10_000 });
  });

  it('limits an organisation principal so principal plus fee fits the wallet', () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    (service as any).ledgerService = {
      calculateWithdrawalCharges: jest.fn((amount: number) => ({
        fee: amount > 0 ? 10_000 : 0,
      })),
    };

    expect((service as any).calculateMaximumWithdrawal(200_000, false)).toBe(
      190_000,
    );
  });

  it('reserves the Bachs payout fee from a platform wallet', () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    expect((service as any).calculateMaximumWithdrawal(200_000, true)).toBe(
      190_000,
    );
  });
});
