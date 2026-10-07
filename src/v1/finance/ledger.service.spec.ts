jest.mock('uuid', () => ({ v4: jest.fn(() => '12345678-test') }));

import { LedgerService } from './ledger.service';

describe('LedgerService transaction participation', () => {
  it('uses the caller transaction instead of opening an independent one', async () => {
    const rootTransaction = jest.fn();
    const transactionClient = {
      journalEntry: {
        create: jest.fn().mockResolvedValue({
          id: 'journal-1',
          reference: 'JE-2026-12345678',
        }),
      },
      journalLine: { create: jest.fn().mockResolvedValue({}) },
      ledgerAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'debit', balance: 0 })
          .mockResolvedValueOnce({ id: 'credit', balance: 500 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new LedgerService(
      { $transaction: rootTransaction } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await service.createJournalEntry(
      {
        withdrawalId: 'withdrawal-1',
        lines: [
          { accountId: 'debit', type: 'DEBIT', amount: 500 },
          { accountId: 'credit', type: 'CREDIT', amount: 500 },
        ],
      },
      transactionClient,
    );

    expect(rootTransaction).not.toHaveBeenCalled();
    expect(transactionClient.journalEntry.create).toHaveBeenCalled();
    expect(transactionClient.journalLine.create).toHaveBeenCalledTimes(2);
  });
});

describe('LedgerService organization withdrawal platform fee reversal', () => {
  const buildService = () =>
    new LedgerService({} as any, {
      get: jest.fn().mockReturnValue(undefined),
    } as any);

  it('returns the platform fee to the clearing account when a payout fails', async () => {
    const transactionClient = {
      journalEntry: { update: jest.fn().mockResolvedValue({}) },
      wallet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'platform-wallet',
          ledgerAccountId: 'platform-ledger',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'clearing-ledger' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const reversed =
      await buildService().reverseOrganizationWithdrawalPlatformFee(
        transactionClient,
        {
          id: 'withdrawal-1',
          metadata: {
            charges: { platformFee: 5_000, providerFee: 5_000 },
            platformFeeAllocatedAt: '2026-01-01T00:00:00.000Z',
            platformFeeJournalEntryId: 'fee-entry',
          },
        },
      );

    expect(reversed).toBe(5_000);
    expect(transactionClient.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'fee-entry' },
      data: { status: 'REVERSED' },
    });
    expect(transactionClient.wallet.update).toHaveBeenCalledWith({
      where: { id: 'platform-wallet' },
      data: { balance: { decrement: 5_000 } },
    });
    expect(transactionClient.ledgerAccount.update).toHaveBeenCalledWith({
      where: { id: 'platform-ledger' },
      data: { balance: { decrement: 5_000 } },
    });
    expect(transactionClient.ledgerAccount.update).toHaveBeenCalledWith({
      where: { id: 'clearing-ledger' },
      data: { balance: { increment: 5_000 } },
    });
  });

  it('does nothing when the withdrawal never allocated a platform fee', async () => {
    const transactionClient = {
      journalEntry: { update: jest.fn(), findFirst: jest.fn() },
      wallet: { findFirst: jest.fn(), update: jest.fn() },
      ledgerAccount: { findUnique: jest.fn(), update: jest.fn() },
    };

    const reversed =
      await buildService().reverseOrganizationWithdrawalPlatformFee(
        transactionClient,
        {
          id: 'withdrawal-1',
          metadata: { charges: { platformFee: 5_000 } },
        },
      );

    expect(reversed).toBe(0);
    expect(transactionClient.wallet.update).not.toHaveBeenCalled();
    expect(transactionClient.ledgerAccount.update).not.toHaveBeenCalled();
  });
});
