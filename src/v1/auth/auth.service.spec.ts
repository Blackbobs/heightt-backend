import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = Object.create(AuthService.prototype) as AuthService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses the department organization for the admin scope', async () => {
    const departmentOrganization = {
      id: 'department-organization-1',
      name: 'Home Science Department (2026/2027)',
      slug: 'home-science-department-2026-2027',
      type: 'DEPARTMENT',
      status: 'ACTIVE',
      academicSessionId: 'session-current',
    };
    const admin = {
      id: 'admin-1',
      adminType: 'DEPARTMENT_ADMIN',
      status: 'ACTIVE',
      assignedAt: new Date(),
      departmentId: 'department-1',
      department: {
        id: 'department-1',
        name: 'Home Science and Management',
        code: 'HSM',
        status: 'ACTIVE',
        faculty: null,
        organizations: [
          {
            ...departmentOrganization,
            id: 'department-organization-old',
            academicSessionId: 'session-old',
          },
          departmentOrganization,
        ],
      },
      academicSessionId: 'session-current',
    };
    const scopedService = Object.assign(
      Object.create(AuthService.prototype),
      {
        cacheService: {
          getUserProfile: jest.fn().mockResolvedValue(null),
          cacheUserProfile: jest.fn().mockResolvedValue(undefined),
        },
        prisma: {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'admin@example.com',
              username: 'admin',
              emailVerified: true,
              status: 'ACTIVE',
              profile: null,
              studentProfile: null,
              admins: [admin],
            }),
          },
        },
      },
    ) as AuthService;

    const result = await scopedService.getCurrentUser('user-1');

    expect(result.adminScopes[0]).toEqual(
      expect.objectContaining({
        departmentId: 'department-1',
        organizationId: 'department-organization-1',
        organization: departmentOrganization,
      }),
    );
  });
});
