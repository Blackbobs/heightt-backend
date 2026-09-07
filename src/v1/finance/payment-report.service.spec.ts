jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { ForbiddenException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService payment report export', () => {
  const findMany = jest.fn();
  let service: FinanceService;

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    service = Object.create(FinanceService.prototype);
    (service as any).prisma = { payment: { findMany } };
  });

  it('restricts organization admins to their assigned organizations', async () => {
    await service.exportAdminPaymentReport(
      {
        allAdmins: [
          { type: 'ORGANIZATION_ADMIN', organizationId: 'org-1' },
          { type: 'ORGANIZATION_ADMIN', organizationId: 'org-2' },
        ],
      },
      { organizationId: 'org-1', status: 'COMPLETED' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { organizationId: 'org-1' },
                { organizationId: 'org-2' },
              ],
            },
            { organizationId: 'org-1' },
          ],
          status: 'COMPLETED',
        },
      }),
    );
  });

  it('allows platform admins to export platform-wide data', async () => {
    await service.exportAdminPaymentReport({
      allAdmins: [{ type: 'PLATFORM_ADMIN', organizationId: null }],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('rejects an admin without an organization finance scope', async () => {
    await expect(
      service.exportAdminPaymentReport({
        allAdmins: [{ type: 'ORGANIZATION_ADMIN', organizationId: null }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
