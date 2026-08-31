import { OnboardingService } from './onboarding.service';

describe('OnboardingService automatic organisation membership', () => {
  function createServiceAndTransaction(organizations: any[]) {
    const service = Object.create(
      OnboardingService.prototype,
    ) as OnboardingService;
    (service as any).logger = { log: jest.fn(), warn: jest.fn() };
    const tx = {
      organization: {
        findMany: jest.fn().mockResolvedValue(organizations),
      },
      organizationMembership: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      organizationJoinRequest: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    return { service, tx };
  }

  it('joins available institution and selected faculty organisations', async () => {
    const organizations = [
      {
        id: 'institution-org',
        name: 'Heightt University',
        type: 'INSTITUTION',
        academicSessionId: null,
      },
      {
        id: 'faculty-org',
        name: 'College of Engineering',
        type: 'FACULTY',
        academicSessionId: null,
      },
    ];
    const { service, tx } = createServiceAndTransaction(organizations);

    await (service as any).autoJoinInstitutionalOrganizationsInTransaction(
      tx,
      'user-1',
      'institution-1',
      'faculty-1',
      'session-1',
    );

    expect(tx.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: 'institution-1',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(tx.organizationMembership.upsert).toHaveBeenCalledTimes(2);
    expect(tx.organizationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: 'institution-org',
          userId: 'user-1',
          status: 'ACTIVE',
          isPrimary: true,
          membershipType: 'STUDENT',
          joinedSessionId: 'session-1',
        }),
      }),
    );
    expect(tx.organizationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: 'faculty-org',
          isPrimary: false,
        }),
      }),
    );
    expect(tx.organizationJoinRequest.upsert).toHaveBeenCalledTimes(2);
  });

  it('completes safely when matching organisations are not available', async () => {
    const { service, tx } = createServiceAndTransaction([]);

    await (service as any).autoJoinInstitutionalOrganizationsInTransaction(
      tx,
      'user-1',
      'institution-1',
      'faculty-1',
    );

    expect(tx.organizationMembership.upsert).not.toHaveBeenCalled();
    expect(tx.organizationJoinRequest.upsert).not.toHaveBeenCalled();
  });
});
