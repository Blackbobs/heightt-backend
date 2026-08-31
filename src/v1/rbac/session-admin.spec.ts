import { BadRequestException } from '@nestjs/common';
import { RbacService } from './rbac.service';

describe('RbacService session-scoped organisation admins', () => {
  function createService(session?: {
    id: string;
    institutionId: string;
    isCurrent: boolean;
    scope: string;
  }) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      admin: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'platform-admin' })
          .mockResolvedValueOnce(null),
      },
      academicSession: { findUnique: jest.fn().mockResolvedValue(session) },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          institutionId: 'institution-1',
          institution: { id: 'institution-1' },
        }),
      },
    };
    return new RbacService(prisma as any, {} as any);
  }

  it('requires an academic session for organisation admins', async () => {
    const service = createService();
    await expect(
      service.assignAdminRole('platform-user', {
        userId: 'user-1',
        adminType: 'ORGANIZATION_ADMIN',
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an old session for organisation admins', async () => {
    const service = createService({
      id: 'old-session',
      institutionId: 'institution-1',
      isCurrent: false,
      scope: 'INSTITUTION',
    });
    await expect(
      service.assignAdminRole('platform-user', {
        userId: 'user-1',
        adminType: 'ORGANIZATION_ADMIN',
        organizationId: 'org-1',
        academicSessionId: 'old-session',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
