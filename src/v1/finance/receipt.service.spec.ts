import { ReceiptService } from './receipt.service';

describe('ReceiptService automatic delivery', () => {
  it.each([true, false])(
    'emails the receipt to the payment contact (guest: %s)',
    async (isGuest) => {
      const email = isGuest ? 'student@example.com' : 'account@example.com';
      const name = isGuest ? 'Ada Okafor' : 'Account Student';
      const payment = {
        id: 'payment-1',
        payerId: 'user-1',
        payer: {
          email: isGuest ? 'guest_123@guest.heightt.invalid' : email,
          username: 'guest_123',
          profile: isGuest
            ? null
            : { firstName: 'Account', lastName: 'Student' },
        },
        metadata: isGuest ? { guestEmail: email, guestName: name } : null,
        amount: 25000,
        serviceFee: 100,
        reference: 'reference-1',
        paymentMethod: 'CARD',
        createdAt: new Date(),
      };
      let savedReceipt: any;
      const prisma = {
        payment: { findUnique: jest.fn().mockResolvedValue(payment) },
        receipt: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }) =>
              Promise.resolve(where.paymentId ? null : savedReceipt),
            ),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            savedReceipt = {
              id: 'receipt-1',
              ...data,
              metadata: { pdfUrl: 'https://example.com/receipt.pdf' },
            };
            return Promise.resolve(savedReceipt);
          }),
        },
      };
      const emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
      const service = new ReceiptService(
        prisma as any,
        {} as any,
        emailService as any,
        {} as any,
      );
      jest.spyOn(service, 'generateReceiptPdf').mockResolvedValue({
        buffer: Buffer.from('receipt PDF'),
        filename: 'receipt.pdf',
      });

      const receipt = await service.generateReceiptFromPayment(
        'payment-1',
        'user-1',
      );
      // Wait for the scheduled delivery and its asynchronous work to finish.
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(receipt.payerEmail).toBe(email);
      expect(receipt.payerName).toBe(name);
      expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        email,
        expect.stringContaining('Payment Receipt'),
        expect.any(String),
        [expect.objectContaining({ filename: 'receipt.pdf' })],
      );
    },
  );
});
