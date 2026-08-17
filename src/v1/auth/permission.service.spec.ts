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
            status: 'ACTIVE',
            permissions: [
              { permissionKey: 'organization:read', resourceId: 'org-2' },
            ],
          },
        ]),
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
});
