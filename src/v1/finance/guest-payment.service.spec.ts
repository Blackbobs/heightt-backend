jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { GuestPaymentService } from './guest-payment.service';

describe('GuestPaymentService', () => {
  it('uses the server-side due amount and guest contact for checkout', async () => {
    const prisma: any = {
      academicLevel: {
        findFirst: jest.fn().mockResolvedValue({ numericLevel: 200 }),
      },
      due: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'due-1',
          name: 'Department due',
          amount: 25_000,
          organizationId: 'org-1',
          organization: {
            id: 'org-1',
            status: 'ACTIVE',
            institutionId: 'inst-1',
            facultyId: 'fac-1',
            departmentId: 'dept-1',
            academicLevelId: null,
          },
        }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          user: { create: jest.fn().mockResolvedValue({ id: 'guest-user-1' }) },
          guestPayer: {
            create: jest
              .fn()
              .mockImplementation(({ data }) =>
                Promise.resolve({ id: 'guest-1', ...data }),
              ),
          },
        }),
      ),
    };
    const bachs = {
      initiatePayment: jest.fn().mockResolvedValue({
        checkoutId: 'checkout-1',
        checkoutUrl: 'https://checkout.example/1',
        pendingPaymentId: 'pending-1',
      }),
    };
    const service = new GuestPaymentService(
      prisma,
      bachs as any,
      {} as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
    );

    const result = await service.initiate({
      email: ' Student@Example.com ',
      firstName: 'Ada',
      lastName: 'Okafor',
      institutionId: 'inst-1',
      facultyId: 'fac-1',
      departmentId: 'dept-1',
      dueId: 'due-1',
      academicLevelId: 'level-200',
      paymentMethod: 'CARD',
    });

    expect(bachs.initiatePayment).toHaveBeenCalledWith(
      'guest-user-1',
      expect.objectContaining({
        amount: 25_000,
        organizationId: 'org-1',
        customer: expect.objectContaining({ email: 'student@example.com' }),
        metadata: expect.objectContaining({ guestDueId: 'due-1' }),
      }),
      undefined,
      undefined,
    );
    expect(result).toEqual(
      expect.objectContaining({
        guestPayerId: 'guest-1',
        accessToken: expect.any(String),
      }),
    );
  });

  it.each([100, 200, 500])(
    'filters guest dues for level %s',
    async (numericLevel) => {
      const prisma: any = {
        academicLevel: {
          findFirst: jest.fn().mockResolvedValue({ numericLevel }),
        },
        due: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new GuestPaymentService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
      );
      await service.listDues({
        institutionId: 'inst',
        academicLevelId: 'level',
      });
      expect(prisma.due.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isFresher: numericLevel === 100 }),
          select: expect.objectContaining({ isFresher: true }),
        }),
      );
    },
  );

  it('returns no guest dues until a level is selected', async () => {
    const service = new GuestPaymentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    expect(await service.listDues({ institutionId: 'inst' })).toEqual([]);
  });

  it('rejects guest checkout for an ineligible level before creating payment records', async () => {
    const prisma: any = {
      academicLevel: {
        findFirst: jest.fn().mockResolvedValue({ numericLevel: 200 }),
      },
      due: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            isFresher: true,
            organization: { status: 'ACTIVE' },
          }),
      },
      $transaction: jest.fn(),
    };
    const service = new GuestPaymentService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.initiate({
        email: 'a@example.com',
        firstName: 'A',
        lastName: 'B',
        institutionId: 'inst',
        academicLevelId: 'level',
        dueId: 'due',
        paymentMethod: 'CARD',
      }),
    ).rejects.toThrow('This due is not available for your academic level');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires the matching secret token to read guest payment status', async () => {
    const prisma: any = {
      guestPayer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new GuestPaymentService(
      prisma,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
    );

    await expect(service.status('pending-1', 'x'.repeat(32))).rejects.toThrow(
      'Invalid guest payment access token',
    );
  });
});
