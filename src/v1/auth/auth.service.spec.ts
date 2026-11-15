import { AuthService } from './auth.service';
import { PasswordUtil } from '../../common/utils/password.util';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = Object.create(AuthService.prototype) as AuthService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reports a failed verification send after registration', async () => {
    const hash = jest.spyOn(PasswordUtil, 'hash').mockResolvedValue('hashed');
    const user = { id: 'user-1', email: 'new@example.com', username: 'new' };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback) =>
        callback({
          user: { create: jest.fn().mockResolvedValue(user) },
          userProfile: { create: jest.fn() },
          emailVerification: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        }),
      ),
      emailVerification: {
        findFirst: jest.fn().mockResolvedValue({ token: 'token-1' }),
      },
    };
    const scopedService = Object.assign(Object.create(AuthService.prototype), {
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      prisma,
      rateLimitService: {
        checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      },
      emailService: {
        sendVerificationEmailWithLink: jest.fn().mockResolvedValue(false),
      },
      cacheService: { invalidateUserCache: jest.fn() },
      configService: { get: jest.fn().mockReturnValue('https://heightt.app') },
    }) as AuthService;

    const result = await scopedService.register(
      {
        email: user.email,
        username: user.username,
        password: 'password',
      } as any,
      { ip: '127.0.0.1' },
    );
    expect(result.message).toContain('could not be sent');
    hash.mockRestore();
  });

  it('keeps the prior verification token when resend fails', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'new@example.com',
          username: 'new',
          emailVerified: false,
        }),
      },
      emailVerification: {
        create: jest.fn().mockResolvedValue({ id: 'new-token' }),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const scopedService = Object.assign(Object.create(AuthService.prototype), {
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      prisma,
      rateLimitService: {
        checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      },
      emailService: {
        sendVerificationEmailWithLink: jest.fn().mockResolvedValue(false),
      },
      configService: { get: jest.fn().mockReturnValue('https://heightt.app') },
    }) as AuthService;

    await expect(
      scopedService.resendVerificationEmail('new@example.com'),
    ).rejects.toThrow('Failed to send verification email');
    expect(prisma.emailVerification.delete).toHaveBeenCalledWith({
      where: { id: 'new-token' },
    });
    expect(prisma.emailVerification.deleteMany).not.toHaveBeenCalled();
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
    const scopedService = Object.assign(Object.create(AuthService.prototype), {
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
    }) as AuthService;

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
