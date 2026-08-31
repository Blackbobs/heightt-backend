jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { WithdrawalWebhookService } from './withdrawal-webhook.service';

describe('WithdrawalWebhookService Bachs events', () => {
  it('verifies the Bachs signature and routes payout.paid to completion', async () => {
    const bachsClient = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    const service = new WithdrawalWebhookService(
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      bachsClient as any,
      {
        invalidateByTag: jest.fn(),
        invalidatePattern: jest.fn(),
      } as any,
    );
    const completion = jest
      .spyOn(service as any, 'handleWithdrawalSucceeded')
      .mockResolvedValue({ withdrawalId: 'withdrawal-1', status: 'COMPLETED' });
    const rawBody = Buffer.from('{"type":"payout.paid"}');

    const result = await service.processWebhook(
      'Bachs',
      {
        id: 'evt-1',
        type: 'payout.paid',
        data: { withdrawal_id: 'pay-1', reference: 'ORG_WTH_1' },
      },
      'signature',
      '12345',
      rawBody,
    );

    expect(bachsClient.verifyWebhookSignature).toHaveBeenCalledWith(
      rawBody,
      'signature',
      '12345',
    );
    expect(completion).toHaveBeenCalled();
    expect(result.status).toBe('COMPLETED');
  });

  it('reconciles stale processing payouts that the final webhook missed', async () => {
    const prisma = {
      withdrawal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'withdrawal-1',
            reference: 'ORG_WTH_1',
            providerPayoutId: 'payout-1',
          },
        ]),
      },
    };
    const bachsClient = {
      getPayout: jest.fn().mockResolvedValue({
        id: 'payout-1',
        status: 'PAID',
        reference: 'ORG_WTH_1',
      }),
    };
    const service = new WithdrawalWebhookService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      bachsClient as any,
      {} as any,
    );
    const completion = jest
      .spyOn(service as any, 'handleWithdrawalSucceeded')
      .mockResolvedValue({ withdrawalId: 'withdrawal-1', status: 'COMPLETED' });

    await service.reconcileStaleProcessingWithdrawals();

    expect(bachsClient.getPayout).toHaveBeenCalledWith('payout-1');
    expect(completion).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'ORG_WTH_1',
        data: expect.objectContaining({ payout_id: 'payout-1' }),
      }),
      'Bachs',
    );
  });

  it('extracts nested payout and internal withdrawal identifiers', () => {
    const service = new WithdrawalWebhookService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(
      (service as any).getWebhookIdentifiers({
        data: {
          object: {
            payout: {
              id: 'payout-1',
              reference: 'ORG_WTH_1',
              metadata: { withdrawalId: 'withdrawal-1' },
            },
          },
        },
      }),
    ).toEqual({
      reference: 'ORG_WTH_1',
      providerReference: 'payout-1',
      withdrawalId: 'withdrawal-1',
    });
  });

  it('invalidates withdrawal history when payout state changes', async () => {
    const cache = {
      invalidateByTag: jest.fn().mockResolvedValue(undefined),
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
    };
    const wallet = {
      invalidateWalletCache: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WithdrawalWebhookService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      wallet as any,
      {} as any,
      cache as any,
    );

    await (service as any).invalidateWithdrawalWallet({
      organizationId: 'org-1',
    });

    expect(cache.invalidateByTag).toHaveBeenCalledWith('withdrawals');
    expect(cache.invalidatePattern).toHaveBeenCalledWith('withdrawals:*');
    expect(wallet.invalidateWalletCache).toHaveBeenCalledWith({
      type: 'ORGANIZATION',
      id: 'org-1',
    });
  });
});
