import { NotificationService } from './notification.service';

describe('NotificationService email delivery', () => {
  const createService = (user: unknown) => {
    const prisma = {
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
    const service = new NotificationService(
      prisma as any,
      {} as any,
      {} as any,
      emailService as any,
      {} as any,
    );
    return { service, prisma, emailService };
  };

  const notification = {
    title: 'Payment Received',
    body: 'Payment successful',
    type: 'FINANCIAL',
    priority: 'NORMAL',
  };

  it('sends guest notifications to the guest contact email', async () => {
    const { service, emailService, prisma } = createService({
      email: 'guest_abc@guest.heightt.invalid',
      username: 'guest_abc',
      profile: null,
      guestPayer: {
        email: 'payer@example.com',
        firstName: 'Ada',
        lastName: 'Okafor',
      },
    });

    await (service as any).sendEmailNotification('user-1', notification);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: { profile: true, guestPayer: true },
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'payer@example.com',
      'Payment Received',
      expect.stringContaining('Ada Okafor'),
    );
  });

  it('does not email an unlinked placeholder guest account', async () => {
    const { service, emailService } = createService({
      email: 'guest_abc@guest.heightt.invalid',
      username: 'guest_abc',
      profile: null,
      guestPayer: null,
    });

    await (service as any).sendEmailNotification('user-1', notification);

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});
