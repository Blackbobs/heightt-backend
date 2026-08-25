import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BachsService } from './bachs.service';

describe('BachsService payment callbacks', () => {
  const user = {
    id: 'user-1',
    email: 'student@example.com',
    username: 'student',
    profile: { firstName: 'Test', lastName: 'Student', phone: null },
  };
  const pending = {
    id: 'pending-1',
    userId: user.id,
    organizationId: 'org-1',
    amount: 10_000,
    reference: 'pending-ref',
    status: 'PENDING',
    bachsCheckoutId: null,
    metadata: {},
    createdAt: new Date(),
  };

  function createService() {
    const tx = {
      pendingPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(pending),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      pendingPayment: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      payment: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const client = {
      getOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      toBachsAmount: jest.fn().mockReturnValue('100.00'),
      createCheckoutSession: jest.fn().mockResolvedValue({
        checkout_id: 'checkout-1',
        checkout_url: 'https://checkout.bachs.example/1',
      }),
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          FRONTEND_URL: 'https://app.heightt.test',
          PAYMENT_REDIRECT_ORIGINS: 'https://app.heightt.test',
        };
        return values[key];
      }),
    };
    const events = {};
    const service = new BachsService(
      prisma as any,
      client as any,
      config as any,
      events as any,
    );
    return { service, prisma, client };
  }

  it('adds the pending payment ID to approved callback URLs', async () => {
    const { service, client } = createService();

    await service.initiatePayment(
      user.id,
      {
        userId: user.id,
        organizationId: 'org-1',
        amount: 10_000,
        paymentMethod: 'CARD',
      },
      'https://app.heightt.test/payment/callback?source=checkout',
      'https://app.heightt.test/payment/cancelled',
    );

    expect(client.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          'https://app.heightt.test/payment/callback?source=checkout&payment=pending-1',
        cancel_url:
          'https://app.heightt.test/payment/cancelled?payment=pending-1',
      }),
    );
  });

  it('rejects callback URLs on an unapproved origin', async () => {
    const { service, client } = createService();

    await expect(
      service.initiatePayment(
        user.id,
        {
          userId: user.id,
          organizationId: 'org-1',
          amount: 10_000,
          paymentMethod: 'CARD',
        },
        'https://attacker.example/callback',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not expose another user pending payment status', async () => {
    const { service, prisma } = createService();
    prisma.pendingPayment.findUnique.mockResolvedValue({
      ...pending,
      user: { id: user.id },
    });

    await expect(
      service.getPendingPaymentStatus(pending.id, 'different-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
