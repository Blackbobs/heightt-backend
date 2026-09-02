jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinanceService } from './finance.service';
import { WithdrawalType } from './dto/withdrawal.dto';

describe('FinanceService withdrawal history', () => {
  const createService = () => {
    const service = Object.create(FinanceService.prototype) as FinanceService;
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          institutionId: 'institution-1',
          facultyId: null,
          departmentId: null,
        }),
      },
      admin: {
        findMany: jest.fn().mockResolvedValue([
          {
            adminType: 'ORGANIZATION_ADMIN',
            organizationId: 'organization-1',
            institutionId: null,
            facultyId: null,
            departmentId: null,
          },
        ]),
      },
      withdrawal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    Object.defineProperty(service, 'prisma', { value: prisma });
    return { service, prisma };
  };

  it('uses an explicit organization ID without excluding sessionless organizations', async () => {
    const { service, prisma } = createService();

    await service.getWithdrawalHistory('user-1', {
      organizationId: 'organization-1',
      academicSessionId: 'session-1',
      type: WithdrawalType.ORGANIZATION,
      page: 1,
      limit: 10,
    });

    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wallet: { organizationId: 'organization-1' },
          metadata: {
            path: ['type'],
            equals: 'ORGANIZATION_WITHDRAWAL',
          },
        },
      }),
    );
  });

  it('still applies an academic session filter when no organization is selected', async () => {
    const { service, prisma } = createService();

    await service.getWithdrawalHistory(
      'platform-admin-1',
      { academicSessionId: 'session-1' },
      true,
    );

    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wallet: {
            organization: { academicSessionId: 'session-1' },
          },
        },
      }),
    );
  });
});
