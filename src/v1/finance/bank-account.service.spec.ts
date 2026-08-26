jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { BadRequestException } from '@nestjs/common';
import { BankAccountService } from './bank-account.service';

describe('BankAccountService bank resolution', () => {
  function createService(response: any) {
    return new BankAccountService(
      {} as any,
      {} as any,
      { resolveBankAccount: jest.fn().mockResolvedValue(response) } as any,
    );
  }

  it('normalizes a camel-case Bachs response', async () => {
    const service = createService({
      success: true,
      data: {
        accountNumber: '0123456789',
        accountName: 'JOHN DOE',
        bankCode: '058',
        bankName: 'Guaranty Trust Bank',
      },
    });

    await expect(
      service.resolveBankAccount({
        bankCode: '058',
        accountNumber: '0123456789',
      }),
    ).resolves.toMatchObject({
      status: true,
      data: { accountName: 'JOHN DOE', bankCode: '058' },
    });
  });

  it('normalizes a nested snake-case Bachs response', async () => {
    const service = createService({
      data: {
        status: true,
        data: {
          account_number: '0123456789',
          account_name: 'JOHN DOE',
          bank_code: '058',
          bank_name: 'Guaranty Trust Bank',
        },
      },
    });

    await expect(
      service.resolveBankAccount({
        bankCode: '058',
        accountNumber: '0123456789',
      }),
    ).resolves.toMatchObject({
      status: true,
      data: { accountName: 'JOHN DOE', bankName: 'Guaranty Trust Bank' },
    });
  });

  it('returns the provider rejection message', async () => {
    const service = createService({
      status: false,
      error: 'Invalid account number',
    });

    await expect(
      service.resolveBankAccount({
        bankCode: '058',
        accountNumber: '0000000000',
      }),
    ).rejects.toEqual(new BadRequestException('Invalid account number'));
  });
});
