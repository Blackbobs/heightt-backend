import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PasswordUtil } from '../../common/utils/password.util';

describe('AuthService password reset', () => {
  const user = {
    id: 'user-1',
    email: 'student@example.com',
    username: 'student',
    status: 'ACTIVE',
  };

  function setup(foundUser: any = user) {
    const tx = {
      passwordReset: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      session: { updateMany: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(foundUser) },
      passwordReset: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (client: any) => unknown) =>
        callback(tx),
      ),
    };
    const rateLimit = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 4 }),
      incrementRateLimit: jest.fn().mockResolvedValue(1),
    };
    const email = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
    };
    const cache = {
      invalidateUserCache: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      rateLimit as any,
      {} as any,
      cache as any,
      email as any,
      {} as any,
    );
    return { service, prisma, tx, rateLimit, email, cache };
  }

  it('returns the same response when an account does not exist', async () => {
    const existing = setup(user);
    const missing = setup(null);
    const request = { ip: '127.0.0.1' };

    const existingResponse = await existing.service.forgotPassword(
      { email: user.email },
      request,
    );
    const missingResponse = await missing.service.forgotPassword(
      { email: 'missing@example.com' },
      request,
    );

    expect(existingResponse).toEqual(missingResponse);
    expect(missing.email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('stores a hash while emailing the raw reset token', async () => {
    const { service, tx, email } = setup();
    await service.forgotPassword(
      { email: ` ${user.email.toUpperCase()} ` },
      { ip: '127.0.0.1' },
    );

    const rawToken = email.sendPasswordResetEmail.mock.calls[0][2];
    const storedToken = tx.passwordReset.create.mock.calls[0][0].data.token;
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(storedToken).not.toBe(rawToken);
  });

  it('consumes the token, changes the password, and revokes sessions', async () => {
    const { service, prisma, tx, email, cache } = setup();
    prisma.passwordReset.findFirst.mockResolvedValue({
      id: 'reset-1',
      userId: user.id,
      user,
    });
    jest.spyOn(PasswordUtil, 'hash').mockResolvedValue('new-password-hash');

    await service.resetPassword(
      { token: 'a'.repeat(64), newPassword: 'NewPassword123!' },
      { ip: '127.0.0.1', headers: { 'user-agent': 'Jest' } },
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { passwordHash: 'new-password-hash' },
    });
    expect(tx.session.updateMany).toHaveBeenCalled();
    expect(cache.invalidateUserCache).toHaveBeenCalledWith(user.id);
    expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(
      user.email,
      user.username,
    );
  });

  it('rejects an invalid or expired token', async () => {
    const { service } = setup();
    await expect(
      service.resetPassword(
        { token: 'a'.repeat(64), newPassword: 'NewPassword123!' },
        { headers: {} },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
