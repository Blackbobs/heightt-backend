import type { Admin } from '../generated/prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService admin scope', () => {
  const departmentAdmin: Admin = {
    id: 'admin-1',
    userId: 'user-1',
    adminType: 'DEPARTMENT_ADMIN',
    institutionId: 'institution-1',
    facultyId: 'faculty-1',
    departmentId: 'department-1',
    organizationId: null,
    assignedBy: null,
    assignedAt: new Date(),
    updatedAt: new Date(),
    status: 'ACTIVE',
    revokedAt: null,
    revokedReason: null,
    academicSessionId: null,
  };

  function createService(admins: Admin[] = [departmentAdmin]) {
    const prisma = {
      admin: { findMany: jest.fn().mockResolvedValue(admins) },
      studentProfile: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      organization: { count: jest.fn().mockResolvedValue(1) },
      event: { count: jest.fn().mockResolvedValue(0) },
      payment: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      studentVerification: { count: jest.fn().mockResolvedValue(0) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const cacheService = {
      get: jest.fn().mockResolvedValue(null),
      setWithTag: jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.assign(Object.create(DashboardService.prototype), {
      prisma,
      cacheService,
    }) as DashboardService;

    return { service, prisma };
  }

  it('limits department dashboard data to assigned department', async () => {
    const { service, prisma } = createService();

    await service.getAdminDashboard('user-1');

    const studentWhere = { departmentId: 'department-1' };
    const organizationWhere = { departmentId: 'department-1' };
    expect(prisma.studentProfile.count).toHaveBeenCalledWith({
      where: studentWhere,
    });
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: studentWhere }),
    );
    expect(prisma.organization.count).toHaveBeenCalledWith({
      where: organizationWhere,
    });
    expect(prisma.event.count).toHaveBeenCalledWith({
      where: {
        organization: { is: organizationWhere },
        status: 'PUBLISHED',
      },
    });
    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: {
        organization: organizationWhere,
        status: 'COMPLETED',
      },
    });
  });

  it('fails closed when department admin has no department ID', async () => {
    const unscopedAdmin = {
      ...departmentAdmin,
      departmentId: null,
    };
    const { service, prisma } = createService([unscopedAdmin]);

    await service.getAdminDashboard('user-1');

    expect(prisma.studentProfile.count).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
    expect(prisma.organization.count).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
  });

  it('limits organization admin data to active organization members', async () => {
    const organizationAdmin: Admin = {
      ...departmentAdmin,
      adminType: 'ORGANIZATION_ADMIN',
      institutionId: null,
      facultyId: null,
      departmentId: null,
      organizationId: 'organization-1',
    };
    const { service, prisma } = createService([organizationAdmin]);

    await service.getAdminDashboard('user-1');

    expect(prisma.studentProfile.count).toHaveBeenCalledWith({
      where: {
        user: {
          is: {
            organizationMemberships: {
              some: {
                organizationId: 'organization-1',
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });
    expect(prisma.organization.count).toHaveBeenCalledWith({
      where: { id: 'organization-1' },
    });
  });
});
