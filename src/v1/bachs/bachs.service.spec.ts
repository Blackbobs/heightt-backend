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
      duePayment: {
        findUnique: jest.fn().mockResolvedValue(null),
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
      toBachsAmount: jest
        .fn()
        .mockImplementation((amount: number) => (amount / 100).toFixed(2)),
      createCheckoutSession: jest.fn().mockResolvedValue({
        checkout_id: 'checkout-1',
        checkout_url: 'https://checkout.bachs.example/1',
      }),
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, string> = {
          FRONTEND_URL: 'https://app.heightt.test',
          PAYMENT_REDIRECT_ORIGINS: 'https://app.heightt.test',
        };
        return values[key] ?? fallback;
      }),
    };
    const events = {};
    const cache = {
      delete: jest.fn(),
      invalidateByTag: jest.fn(),
    };
    const service = new BachsService(
      prisma as any,
      client as any,
      config as any,
      events as any,
      cache as any,
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
        pricing: expect.objectContaining({ amount: '200.00' }),
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

  it('rejects another checkout after the due has a payment', async () => {
    const { service, prisma, client } = createService();
    const tx = {
      pendingPayment: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      duePayment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'due-payment-1' }),
      },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await expect(
      service.initiatePayment(user.id, {
        userId: user.id,
        organizationId: 'org-1',
        amount: 10_000,
        paymentMethod: 'CARD',
        dueAssignmentId: 'assignment-1',
      }),
    ).rejects.toThrow('This due has already been paid');

    expect(tx.pendingPayment.create).not.toHaveBeenCalled();
    expect(client.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('reuses an orphaned pending row when checkout creation is retried', async () => {
    const { service, prisma, client } = createService();
    const tx = {
      pendingPayment: {
        findFirst: jest.fn().mockResolvedValue(pending),
        create: jest.fn(),
        update: jest.fn(),
      },
      duePayment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    const result = await service.initiatePayment(user.id, {
      userId: user.id,
      organizationId: 'org-1',
      amount: 10_000,
      paymentMethod: 'CARD',
      dueAssignmentId: 'assignment-1',
    });

    expect(tx.pendingPayment.create).not.toHaveBeenCalled();
    expect(client.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(result.pendingPaymentId).toBe(pending.id);
  });

  it('expires a stale row and creates a fresh payment attempt', async () => {
    const { service, prisma } = createService();
    const stale = {
      ...pending,
      bachsCheckoutId: 'stale-checkout',
      createdAt: new Date(Date.now() - 61 * 60 * 1000),
    };
    const fresh = { ...pending, id: 'pending-2', reference: 'pending-ref-2' };
    const tx = {
      pendingPayment: {
        findFirst: jest.fn().mockResolvedValue(stale),
        create: jest.fn().mockResolvedValue(fresh),
        update: jest.fn().mockResolvedValue({ ...stale, status: 'EXPIRED' }),
      },
      duePayment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    const result = await service.initiatePayment(user.id, {
      userId: user.id,
      organizationId: 'org-1',
      amount: 10_000,
      paymentMethod: 'CARD',
      dueAssignmentId: 'assignment-1',
    });

    expect(tx.pendingPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stale.id },
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
    expect(tx.pendingPayment.create).toHaveBeenCalledTimes(1);
    expect(result.pendingPaymentId).toBe(fresh.id);
  });
});
