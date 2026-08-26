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
