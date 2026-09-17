import { NotFoundException } from '@nestjs/common';

// WalletService pulls in the ESM-only `uuid` package, which jest cannot
// transform, so it is stubbed out for these tests.
jest.mock('../finance/wallet.service', () => ({
  WalletService: class WalletService {},
}));

import { StudentsService } from './students.service';

describe('StudentsService.getAllStudents organization scope', () => {
  const departmentOrg = {
    institutionId: 'institution-1',
    facultyId: 'faculty-1',
    departmentId: 'department-1',
    academicLevelId: null,
    academicSessionId: null,
  };

  function setup(organization: any = departmentOrg) {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(organization) },
      studentProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new StudentsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('narrows a department organization to that department', async () => {
    const { service, prisma } = setup();

    await service.getAllStudents(1, 10, { organizationId: 'org-1' });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: {
        institutionId: true,
        facultyId: true,
        departmentId: true,
        academicLevelId: true,
        academicSessionId: true,
      },
    });
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: 'institution-1',
          facultyId: 'faculty-1',
          departmentId: 'department-1',
        },
      }),
    );
    expect(prisma.studentProfile.count).toHaveBeenCalledWith({
      where: {
        institutionId: 'institution-1',
        facultyId: 'faculty-1',
        departmentId: 'department-1',
      },
    });
  });

  it('narrows a faculty organization to that faculty only', async () => {
    const { service, prisma } = setup({
      institutionId: 'institution-1',
      facultyId: 'faculty-1',
      departmentId: null,
      academicLevelId: null,
      academicSessionId: null,
    });

    await service.getAllStudents(1, 10, { organizationId: 'org-1' });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: 'institution-1', facultyId: 'faculty-1' },
      }),
    );
  });

  it('narrows a level organization to that academic level', async () => {
    const { service, prisma } = setup({
      institutionId: 'institution-1',
      facultyId: 'faculty-1',
      departmentId: 'department-1',
      academicLevelId: 'level-200',
      academicSessionId: null,
    });

    await service.getAllStudents(1, 10, { organizationId: 'org-1' });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ currentAcademicLevelId: 'level-200' }),
      }),
    );
  });

  it('scopes organizations without an academic unit by membership', async () => {
    const { service, prisma } = setup({
      institutionId: null,
      facultyId: null,
      departmentId: null,
      academicLevelId: null,
      academicSessionId: null,
    });

    await service.getAllStudents(1, 10, { organizationId: 'club-1' });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: {
            organizationMemberships: {
              some: { organizationId: 'club-1', status: 'ACTIVE' },
            },
          },
        },
      }),
    );
  });

  it('filters students and records by academic session', async () => {
    const { service, prisma } = setup();

    await service.getAllStudents(1, 10, {
      organizationId: 'org-1',
      academicSessionId: 'session-1',
    });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicRecords: { some: { sessionId: 'session-1' } },
        }),
        include: expect.objectContaining({
          academicRecords: expect.objectContaining({
            where: { sessionId: 'session-1' },
          }),
        }),
      }),
    );
  });

  it('falls back to the organization session when none is requested', async () => {
    const { service, prisma } = setup({
      ...departmentOrg,
      academicSessionId: 'org-session-1',
    });

    await service.getAllStudents(1, 10, { organizationId: 'org-1' });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicRecords: { some: { sessionId: 'org-session-1' } },
        }),
      }),
    );
  });

  it('lets an explicit academic session override the organization session', async () => {
    const { service, prisma } = setup({
      ...departmentOrg,
      academicSessionId: 'org-session-1',
    });

    await service.getAllStudents(1, 10, {
      organizationId: 'org-1',
      academicSessionId: 'session-2',
    });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicRecords: { some: { sessionId: 'session-2' } },
        }),
      }),
    );
  });

  it('lets explicit ids take precedence over the organization scope', async () => {
    const { service, prisma } = setup();

    await service.getAllStudents(1, 10, {
      organizationId: 'org-1',
      departmentId: 'department-2',
    });

    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 'department-2' }),
      }),
    );
  });

  it('rejects an unknown organization', async () => {
    const { service } = setup(null);

    await expect(
      service.getAllStudents(1, 10, { organizationId: 'missing-org' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('leaves the query unscoped when no filters are given', async () => {
    const { service, prisma } = setup();

    await service.getAllStudents(1, 10, {});

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        include: expect.objectContaining({
          academicRecords: expect.objectContaining({ where: undefined }),
        }),
      }),
    );
  });
});
