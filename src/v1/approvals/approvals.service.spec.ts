import { ApprovalsService } from './approvals.service';

function createFixture() {
  const request = {
    id: 'approval-1',
    entityType: 'ORGANIZATION',
    entityId: 'org-1',
    entityName: 'Builders Club',
    submittedBy: 'user-1',
    status: 'PENDING',
  };
  const transaction = {
    organization: { update: jest.fn().mockResolvedValue({}) },
    admin: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    approvalRequest: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    approvalRequest: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(request)
        .mockResolvedValue({ ...request, status: 'APPROVED' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        email: 'creator@example.com',
        username: 'creator',
      }),
    },
    $transaction: jest.fn(async (callback) => callback(transaction)),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(true) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ApprovalsService(
    prisma as never,
    email as never,
    config as never,
  );
  return { service, transaction, email };
}

describe('ApprovalsService organization approval', () => {
  it('activates the organization and creator admin before emailing the dashboard link', async () => {
    const { service, transaction, email } = createFixture();

    await service.review('approval-1', 'platform-admin-1', 'APPROVED');

    expect(transaction.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: expect.objectContaining({ status: 'ACTIVE' }),
    });
    expect(transaction.admin.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: { status: 'ACTIVE', revokedAt: null, revokedReason: null },
    });
    expect(email.sendEmail).toHaveBeenCalledWith(
      'creator@example.com',
      'Builders Club was approved',
      expect.stringContaining('https://admin-preview.heightt.app/'),
    );
  });
});
