jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { BadRequestException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService independent organizations', () => {
  const makeService = () => {
    const prisma = {
      institution: { findUnique: jest.fn() },
      organization: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'independent-org-1',
          ...data,
          institutionId: data.institutionId ?? null,
        })),
        findUnique: jest.fn().mockResolvedValue({ institutionId: null }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const cacheService = {
      delete: jest.fn(),
      invalidateByTag: jest.fn(),
      invalidatePattern: jest.fn(),
    };
    const walletService = {
      getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
    };
    const service = new OrganizationsService(
      prisma as any,
      cacheService as any,
      {} as any,
      {} as any,
      walletService as any,
    );
    return { service, prisma, cacheService };
  };

  it('creates a custom organization without a school affiliation', async () => {
    const { service, prisma, cacheService } = makeService();

    const result = await service.createOrganization('creator-1', {
      name: 'Builders Community',
      slug: 'builders-community',
      type: 'CLUB',
      scope: 'CUSTOM',
    });

    expect(prisma.institution.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ institutionId: undefined }),
    });
    expect(cacheService.delete).not.toHaveBeenCalledWith(
      'institution:undefined',
    );
    expect(result.institutionId).toBeNull();
  });

  it('keeps academic organizations tied to one institution', async () => {
    const { service } = makeService();

    await expect(
      service.createOrganization('creator-1', {
        name: 'Computer Science Department',
        slug: 'computer-science',
        type: 'DEPARTMENT',
        scope: 'DEPARTMENT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
