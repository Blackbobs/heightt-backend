import { PermissionService } from './permission.service';

describe('PermissionService multi-org admins', () => {
  it('checks permissions across all org admin scopes and honors requested organization', async () => {
    const prisma = {
      admin: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            userId: 'user-1',
            adminType: 'ORGANIZATION_ADMIN',
            organizationId: 'org-1',
            academicSessionId: 'session-1',
            status: 'ACTIVE',
            permissions: [
              { permissionKey: 'dashboard:read', resourceId: null },
            ],
          },
          {
            id: 'a2',
            userId: 'user-1',
            adminType: 'ORGANIZATION_ADMIN',
            organizationId: 'org-2',
            academicSessionId: 'session-2',
            status: 'ACTIVE',
            permissions: [
              { permissionKey: 'organization:read', resourceId: 'org-2' },
            ],
          },
        ]),
      },
      organization: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            where.id === 'org-2' && where.academicSessionId === 'session-2'
              ? { id: 'org-2' }
              : null,
          ),
        ),
      },
    };

    const service = new PermissionService(prisma as any);

    await expect(
      service.checkPermission('user-1', 'organization:read', 'org-2'),
    ).resolves.toBe(true);

    await expect(
      service.checkPermission('user-1', 'organization:read', 'org-1'),
    ).resolves.toBe(false);

    await expect(service.getUserPermissions('user-1')).resolves.toEqual(
      expect.arrayContaining(['organization:read', 'dashboard:read']),
    );
  });

  it('does not allow an organisation admin to access another session', async () => {
    const prisma = {
      admin: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'admin-1',
            adminType: 'ORGANIZATION_ADMIN',
            organizationId: 'org-1',
            academicSessionId: 'session-2026',
            status: 'ACTIVE',
            permissions: [
              { permissionKey: 'organization:read', resourceId: null },
            ],
          },
        ]),
      },
      organization: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
      due: { findFirst: jest.fn().mockResolvedValue(null) },
      event: { findFirst: jest.fn().mockResolvedValue(null) },
      announcement: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PermissionService(prisma as any);

    await expect(
      service.checkPermission('user-1', 'organization:read', 'org-2027'),
    ).resolves.toBe(false);
  });
});
