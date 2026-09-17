import { ReceiptService } from './receipt.service';
import PDFDocument from 'pdfkit';

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
          guestPayer: isGuest ? { email } : null,
          profile: isGuest
            ? null
            : { firstName: 'Account', lastName: 'Student' },
        },
        metadata: isGuest
          ? {
              guestName: name,
              guestPhone: '08012345678',
              guestMatricNumber: 'CSC/2026/001',
            }
          : null,
        description: 'Department dues',
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
              metadata: {
                ...data.metadata,
                pdfUrl: 'https://example.com/receipt.pdf',
              },
            };
            return Promise.resolve(savedReceipt);
          }),
        },
        duePayment: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
      const service = new ReceiptService(
        prisma as any,
        {} as any,
        emailService as any,
        {} as any,
      );
      jest.spyOn(service as any, 'fetchImageBuffer').mockResolvedValue(null);
      const pdfText = jest.spyOn(PDFDocument.prototype, 'text');

      const receipt = await service.generateReceiptFromPayment(
        'payment-1',
        'user-1',
      );
      // Wait for the scheduled delivery and its asynchronous work to finish.
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(receipt.payerEmail).toBe(email);
      expect(receipt.payerName).toBe(name);
      // PDF rendering also waits for the document stream to end.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        email,
        expect.stringContaining('Payment Receipt'),
        expect.any(String),
        [expect.objectContaining({ filename: `${receipt.receiptNumber}.pdf` })],
      );
      const html = emailService.sendEmail.mock.calls[0][2];
      const renderedText = pdfText.mock.calls.map(([text]) => text).join('\n');
      for (const content of [html, renderedText]) {
        expect(content).toContain(name);
        expect(content).toContain(email);
        expect(content).toContain('Department dues');
        expect(content).not.toContain('guest_123');
        if (isGuest) {
          expect(content).toContain('08012345678');
          expect(content).toContain('CSC/2026/001');
        }
      }
      expect(receipt.totalAmount).toBe(25100);
      pdfText.mockRestore();
    },
  );
});
