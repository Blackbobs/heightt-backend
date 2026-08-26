jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinanceService } from './finance.service';

describe('FinanceService withdrawal accounting', () => {
  it('releases a rejected withdrawal hold without increasing wallet balance', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    const walletUpdate = jest.fn().mockResolvedValue({});
    const withdrawal = {
      id: 'withdrawal-1',
      userId: 'org-admin-1',
      walletId: 'wallet-1',
      amount: 400,
      fee: 100,
      status: 'PENDING',
      bankName: 'Test Bank',
      wallet: {
        id: 'wallet-1',
        balance: 10_000,
        heldBalance: 500,
        organizationId: 'org-1',
        isPlatformWallet: false,
        ledgerAccount: { id: 'ledger-1', balance: 10_000 },
      },
    };
    const tx = {
      withdrawal: {
        findUnique: jest.fn().mockResolvedValue(withdrawal),
        update: jest
          .fn()
          .mockResolvedValue({ ...withdrawal, status: 'FAILED' }),
      },
      walletHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wallet: { update: walletUpdate },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    (service as any).prisma = {
      admin: {
        findFirst: jest.fn().mockResolvedValue({ id: 'platform-admin' }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    (service as any).walletService = {
      invalidateWalletCache: jest.fn(),
    };
    (service as any).logger = { log: jest.fn(), error: jest.fn() };
    (service as any).notifyUser = jest.fn();
    (service as any).KOBO_PER_NAIRA = 100;

    await service.rejectUserWithdrawal(
      withdrawal.id,
      'platform-admin-user',
      'Not approved',
    );

    expect(walletUpdate).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { heldBalance: 0 },
    });
    expect(walletUpdate.mock.calls[0][0].data.balance).toBeUndefined();
  });
});
