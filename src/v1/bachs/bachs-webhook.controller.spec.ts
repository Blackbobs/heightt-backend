import { BachsWebhookController } from './bachs-webhook.controller';

describe('BachsWebhookController fulfillment events', () => {
  const request = { rawBody: Buffer.from('{}') } as any;

  function createController() {
    const client = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    const service = {
      completePayment: jest
        .fn()
        .mockResolvedValue({ payment: { id: 'pay-1' } }),
    };
    return {
      controller: new BachsWebhookController(client as any, service as any),
      service,
    };
  }

  it('reconciles checkout.completed against Bachs before fulfillment', async () => {
    const { controller, service } = createController();
    (controller as any).bachsClient.getCheckoutSession = jest
      .fn()
      .mockResolvedValue({
        checkout_id: 'chk-1',
        status: 'COMPLETED',
        payment: {
          payment_id: 'pay-provider-1',
          settlement_amount: '102.00',
        },
        metadata: { pendingPaymentId: 'pending-1' },
      });

    const result = await controller.handleWebhook(
      'signature',
      '',
      '',
      '',
      String(Math.floor(Date.now() / 1000)),
      'request-1',
      {
        type: 'checkout.completed',
        data: { checkout_id: 'chk-1', payment_status: 'paid' },
      },
      request,
    );

    expect(result.received).toBe(true);
    expect(service.completePayment).toHaveBeenCalledWith(
      'chk-1',
      'pay-provider-1',
      '102.00',
      '',
      expect.objectContaining({ pendingPaymentId: 'pending-1' }),
    );
  });

  it('fulfills collection.succeeded using the settlement amount', async () => {
    const { controller, service } = createController();

    await controller.handleWebhook(
      'signature',
      '',
      '',
      '',
      String(Math.floor(Date.now() / 1000)),
      'request-2',
      {
        id: 'evt-1',
        type: 'collection.succeeded',
        data: {
          charge_id: 'charge-1',
          checkout_id: 'chk-1',
          amount: '5202.00',
          settlement_amount: '5100.00',
          settlement_currency: 'NGN',
          processing_fee: '102.00',
          metadata: { pendingPaymentId: 'pending-1' },
        },
      },
      request,
    );

    expect(service.completePayment).toHaveBeenCalledWith(
      'chk-1',
      'charge-1',
      '5100.00',
      undefined,
      expect.objectContaining({
        pendingPaymentId: 'pending-1',
        processingFee: '102.00',
      }),
    );
  });
});
