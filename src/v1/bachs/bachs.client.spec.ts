import { createHmac } from 'crypto';
import { BachsClient } from './bachs.client';

describe('BachsClient webhook verification', () => {
  const secret = 'whsec_test_signing_secret';

  function createClient() {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          BACHS_API_KEY: 'sk_test_key',
          BACHS_BASE_URL: 'https://api.bachs.io',
          BACHS_WEBHOOK_SECRET: secret,
          BACHS_WEBHOOK_TOLERANCE: 300,
        };
        return values[key] ?? fallback;
      }),
    };
    return new BachsClient(config as any);
  }

  it('verifies the documented timestamp.raw-body HMAC-SHA256 signature', () => {
    const client = createClient();
    const body = Buffer.from('{"id":"evt_1","type":"collection.succeeded"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
      .digest('hex');

    expect(client.verifyWebhookSignature(body, signature, timestamp)).toBe(
      true,
    );
  });

  it('rejects stale webhook timestamps', () => {
    const client = createClient();
    const body = Buffer.from('{}');
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = createHmac('sha256', secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
      .digest('hex');

    expect(client.verifyWebhookSignature(body, signature, timestamp)).toBe(
      false,
    );
  });
});
