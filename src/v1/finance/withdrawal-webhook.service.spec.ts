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
});
