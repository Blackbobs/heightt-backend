jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinanceService } from './finance.service';

describe('FinanceService withdrawal accounting', () => {
  it('reserves only the fixed Bachs fee for organization withdrawals', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    (service as any).KOBO_PER_NAIRA = 100;
    (service as any).BACHS_PAYOUT_FEE = 10_000;
    (service as any).assertOrganizationAdminScope = jest.fn();
    (service as any).walletService = {
      getOrCreateWallet: jest.fn().mockResolvedValue({
        balance: 100_000,
        heldBalance: 0,
        currency: 'NGN',
      }),
    };

    const quote = await service.getWithdrawalQuote('admin-1', {
      type: 'ORGANIZATION' as any,
      organizationId: 'organization-1',
      amount: 90_000,
    });

    expect(quote).toEqual(
      expect.objectContaining({
        fee: 10_000,
        platformFee: 0,
        providerFee: 10_000,
        totalDebit: 100_000,
        maxWithdrawable: 90_000,
        canWithdraw: true,
        feePolicy: 'PROVIDER_FEE_ONLY',
      }),
    );
  });

  it('describes an approved payout as processing until the provider completes it', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    const notificationCreate = jest.fn().mockResolvedValue({});
    (service as any).prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
        }),
      },
      notification: { create: notificationCreate },
    };
    const sendEmail = jest.fn(() => new Promise<boolean>(() => undefined));
    (service as any).emailService = { sendEmail };

    await (service as any).notifyUser('user-1', 'WITHDRAWAL_PROCESSING', {
      withdrawalId: 'withdrawal-1',
      amountFormatted: '₦500.00',
    });

    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Withdrawal Processing ⏳',
        body: expect.stringContaining('is being processed'),
      }),
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('compensates an immediately failed provider payout without notifying the user', async () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    const compensate = jest.fn().mockResolvedValue(undefined);
    (service as any).prisma = {
      withdrawal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'withdrawal-1',
          walletId: 'wallet-1',
          amount: 500,
          fee: 0,
          reference: 'WD-1',
          metadata: { payoutDestinationId: 'destination-1' },
        }),
      },
    };
    (service as any).bachsClient = {
      toBachsAmount: jest.fn().mockReturnValue('5.00'),
      createPayout: jest.fn().mockResolvedValue({
        id: 'payout-1',
        status: 'failed',
        reason: 'Provider rejected the payout',
      }),
    };
    (service as any).logger = { error: jest.fn() };
    (service as any).compensateFailedPayoutSubmission = compensate;

    await expect(
      (service as any).triggerWithdrawalTransfer('withdrawal-1'),
    ).rejects.toThrow('Provider rejected the payout');
    expect(compensate).toHaveBeenCalledWith(
      'withdrawal-1',
      'Provider rejected the payout',
    );
  });

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
