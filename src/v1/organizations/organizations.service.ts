import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { PermissionService } from '../auth/permission.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AddMemberDto,
  UpdateMemberDto,
} from './dto';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly permissionService: PermissionService,
  ) {}

  // ============================================
  // ORGANIZATION CRUD
  // ============================================

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    this.logger.log(`Creating organization: ${dto.name}`);

    // Validate institution exists
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    // Validate slug uniqueness within institution
    const existingSlug = await this.prisma.organization.findFirst({
      where: {
        institutionId: dto.institutionId,
        slug: dto.slug,
      },
    });
    if (existingSlug) {
      throw new ConflictException(
        'Organization slug already exists in this institution',
      );
    }

    // Validate parent organization if provided
    let parentOrganization: any = null;
    if (dto.parentOrganizationId) {
      parentOrganization = await this.prisma.organization.findUnique({
        where: { id: dto.parentOrganizationId },
      });
      if (!parentOrganization) {
        throw new NotFoundException('Parent organization not found');
      }
      if (parentOrganization.institutionId !== dto.institutionId) {
        throw new BadRequestException(
          'Parent organization must be in the same institution',
        );
      }
    }

    // Validate faculty if provided
    if (dto.facultyId) {
      const faculty = await this.prisma.faculty.findUnique({
        where: { id: dto.facultyId },
      });
      if (!faculty) {
        throw new NotFoundException('Faculty not found');
      }
      if (faculty.institutionId !== dto.institutionId) {
        throw new BadRequestException(
          'Faculty must belong to the selected institution',
        );
      }
    }

    // Validate department if provided
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        include: { faculty: true },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
      if (dto.facultyId && department.facultyId !== dto.facultyId) {
        throw new BadRequestException(
          'Department must belong to the selected faculty',
        );
      }
    }

    // Validate academic level if provided
    if (dto.academicLevelId) {
      const level = await this.prisma.academicLevel.findUnique({
        where: { id: dto.academicLevelId },
        include: { department: true },
      });
      if (!level) {
        throw new NotFoundException('Academic level not found');
      }
      if (dto.departmentId && level.departmentId !== dto.departmentId) {
        throw new BadRequestException(
          'Academic level must belong to the selected department',
        );
      }
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        type: dto.type as any,
        scope: dto.scope as any,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        academicLevelId: dto.academicLevelId,
        parentOrganizationId: dto.parentOrganizationId,
        createdBy: userId,
        status: 'DRAFT',
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_CREATED',
        details: JSON.stringify({
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          institutionId: dto.institutionId,
        }),
      },
    });

    // Invalidate cache
    await this.cacheService.delete(`institution:${dto.institutionId}`);

    this.logger.log(`Organization created: ${organization.id}`);
    return organization;
  }

  async getAllOrganizations(
    page: number = 1,
    limit: number = 10,
    filters?: {
      institutionId?: string;
      status?: string;
      type?: string;
      scope?: string;
      search?: string;
      parentId?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.institutionId) {
      where.institutionId = filters.institutionId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.scope) {
      where.scope = filters.scope;
    }
    if (filters?.parentId) {
      where.parentOrganizationId = filters.parentId;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { slug: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        include: {
          institution: true,
          faculty: true,
          department: true,
          academicLevel: true,
          parent: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          memberships: {
            where: { status: 'ACTIVE' },
            take: 5,
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  profile: true,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      data: organizations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrganizationById(id: string, includeRelations: boolean = true) {
    // Check cache
    const cacheKey = `organization:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Organization ${id} found in cache`);
      return cached;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: includeRelations
        ? {
            institution: true,
            faculty: true,
            department: true,
            academicLevel: true,
            parent: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            children: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    username: true,
                    profile: true,
                  },
                },
                roles: {
                  include: {
                    role: true,
                  },
                },
              },
              orderBy: { joinedAt: 'desc' },
            },
            wallet: true,
          }
        : undefined,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, organization, 300);

    return organization;
  }

  async getOrganizationBySlug(slug: string, institutionId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        slug,
        institutionId,
      },
      include: {
        institution: true,
        faculty: true,
        department: true,
        academicLevel: true,
        parent: true,
        children: true,
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async updateOrganization(
    id: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ) {
    this.logger.log(`Updating organization: ${id}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: { institution: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission to update
    const canUpdate = await this.permissionService.checkPermission(
      userId,
      'organization:update',
      id,
    );
    if (!canUpdate) {
      throw new ForbiddenException(
        'You do not have permission to update this organization',
      );
    }

    // If slug is being updated, check uniqueness
    if (dto.slug && dto.slug !== organization.slug) {
      const existingSlug = await this.prisma.organization.findFirst({
        where: {
          institutionId: organization.institutionId,
          slug: dto.slug,
          NOT: { id },
        },
      });
      if (existingSlug) {
        throw new ConflictException('Slug already exists in this institution');
      }
    }

    // If status is being changed, validate transition
    if (dto.status) {
      this.validateStatusTransition(organization.status, dto.status);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        type: dto.type as any,
        scope: dto.scope as any,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        academicLevelId: dto.academicLevelId,
        status: dto.status as any,
        updatedBy: userId,
        activatedAt: dto.status === 'ACTIVE' ? new Date() : undefined,
      },
    });

    // Invalidate cache
    await this.cacheService.delete(`organization:${id}`);
    await this.cacheService.delete(`institution:${organization.institutionId}`);

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_UPDATED',
        details: JSON.stringify({
          organizationId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Organization updated: ${id}`);
    return updated;
  }

  async deleteOrganization(id: string, userId: string) {
    this.logger.log(`Deleting organization: ${id}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        children: true,
        memberships: true,
        roles: true,
        dues: true,
        announcements: true,
        events: true,
      },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Only platform admins can delete organizations
    const isPlatformAdmin = await this.permissionService.checkPermission(
      userId,
      'organization:delete',
    );
    if (!isPlatformAdmin) {
      throw new ForbiddenException(
        'Only platform admins can delete organizations',
      );
    }

    // Check for related data
    if (
      organization.children.length > 0 ||
      organization.memberships.length > 0 ||
      organization.roles.length > 0 ||
      organization.dues.length > 0 ||
      organization.announcements.length > 0 ||
      organization.events.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete organization with existing related data. Archive instead.',
      );
    }

    const deleted = await this.prisma.organization.delete({
      where: { id },
    });

    // Invalidate cache
    await this.cacheService.delete(`organization:${id}`);
    await this.cacheService.delete(`institution:${organization.institutionId}`);

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_DELETED',
        details: JSON.stringify({
          organizationId: id,
          name: organization.name,
          slug: organization.slug,
        }),
      },
    });

    this.logger.log(`Organization deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // MEMBERSHIP MANAGEMENT
  // ============================================

  // In the addMember method, fix the status type
  async addMember(organizationId: string, userId: string, dto: AddMemberDto) {
    this.logger.log(`Adding member to organization: ${organizationId}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const existing = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: dto.userId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    // If this is a student membership, validate student profile exists
    if (dto.membershipType === 'STUDENT') {
      const studentProfile = await this.prisma.studentProfile.findUnique({
        where: { userId: dto.userId },
      });
      if (!studentProfile) {
        throw new BadRequestException(
          'Student profile required for student membership',
        );
      }
    }

    const membership = await this.prisma.organizationMembership.create({
      data: {
        organizationId,
        userId: dto.userId,
        membershipType: dto.membershipType as any,
        status: (dto.status || 'PENDING') as any, // Fix: Cast to any
        isPrimary: dto.isPrimary || false,
        joinedAt: new Date(),
        joinedSessionId: dto.sessionId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    // If this is the first member, activate the organization
    const memberCount = await this.prisma.organizationMembership.count({
      where: { organizationId, status: 'ACTIVE' },
    });
    if (memberCount === 1 && organization.status === 'DRAFT') {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          status: 'PENDING_ACTIVATION',
          updatedBy: userId,
        },
      });
    }

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_MEMBER_ADDED',
        details: JSON.stringify({
          organizationId,
          memberId: dto.userId,
          membershipType: dto.membershipType,
        }),
      },
    });

    // Invalidate cache
    await this.cacheService.delete(`organization:${organizationId}`);

    this.logger.log(`Member added to organization: ${organizationId}`);
    return membership;
  }

  async getOrganizationMembers(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      membershipType?: string;
      search?: string;
    },
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const skip = (page - 1) * limit;
    const where: any = { organizationId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.membershipType) {
      where.membershipType = filters.membershipType;
    }
    if (filters?.search) {
      where.user = {
        OR: [
          { email: { contains: filters.search, mode: 'insensitive' } },
          { username: { contains: filters.search, mode: 'insensitive' } },
          {
            profile: {
              firstName: { contains: filters.search, mode: 'insensitive' },
            },
          },
          {
            profile: {
              lastName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        ],
      };
    }

    const [members, total] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
              studentProfile: true,
            },
          },
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);

    return {
      data: members,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateMember(
    organizationId: string,
    membershipId: string,
    userId: string,
    dto: UpdateMemberDto,
  ) {
    this.logger.log(
      `Updating member ${membershipId} in organization ${organizationId}`,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        status: dto.status as any,
        membershipType: dto.membershipType as any,
        isPrimary: dto.isPrimary,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_MEMBER_UPDATED',
        details: JSON.stringify({
          organizationId,
          membershipId,
          changes: dto,
        }),
      },
    });

    await this.cacheService.delete(`organization:${organizationId}`);

    this.logger.log(`Member updated: ${membershipId}`);
    return updated;
  }

  async removeMember(
    organizationId: string,
    membershipId: string,
    userId: string,
  ) {
    this.logger.log(
      `Removing member ${membershipId} from organization ${organizationId}`,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Soft delete - update status to LEFT or REMOVED
    const removed = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_MEMBER_REMOVED',
        details: JSON.stringify({
          organizationId,
          membershipId,
          memberId: membership.userId,
        }),
      },
    });

    await this.cacheService.delete(`organization:${organizationId}`);

    this.logger.log(`Member removed: ${membershipId}`);
    return removed;
  }

  // ============================================
  // ORGANIZATION ACTIVATION
  // ============================================

  async activateOrganization(id: string, userId: string) {
    this.logger.log(`Activating organization: ${id}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
        },
      },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status === 'ACTIVE') {
      throw new BadRequestException('Organization is already active');
    }

    // Need at least one active member to activate
    if (organization.memberships.length === 0) {
      throw new BadRequestException(
        'Organization needs at least one active member to activate',
      );
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        updatedBy: userId,
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_ACTIVATED',
        details: JSON.stringify({
          organizationId: id,
          name: organization.name,
        }),
      },
    });

    await this.cacheService.delete(`organization:${id}`);
    await this.cacheService.delete(`institution:${organization.institutionId}`);

    this.logger.log(`Organization activated: ${id}`);
    return updated;
  }

  async archiveOrganization(id: string, userId: string) {
    this.logger.log(`Archiving organization: ${id}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status === 'ARCHIVED') {
      throw new BadRequestException('Organization is already archived');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        updatedBy: userId,
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ORGANIZATION_ARCHIVED',
        details: JSON.stringify({
          organizationId: id,
          name: organization.name,
        }),
      },
    });

    await this.cacheService.delete(`organization:${id}`);
    await this.cacheService.delete(`institution:${organization.institutionId}`);

    this.logger.log(`Organization archived: ${id}`);
    return updated;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): void {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['PENDING_ACTIVATION', 'INACTIVE'],
      PENDING_ACTIVATION: ['ACTIVE', 'INACTIVE', 'DRAFT'],
      ACTIVE: ['INACTIVE', 'SUSPENDED', 'ARCHIVED'],
      INACTIVE: ['ACTIVE', 'ARCHIVED'],
      SUSPENDED: ['ACTIVE', 'ARCHIVED'],
      ARCHIVED: [],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  // ============================================
  // ORGANIZATION STATISTICS
  // ============================================

  async getOrganizationStats(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [
      total,
      byStatus,
      byType,
      totalMembers,
      activeMembers,
      totalChildren,
    ] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.organization.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prisma.organizationMembership.count({
        where: {
          organization: where,
        },
      }),
      this.prisma.organizationMembership.count({
        where: {
          organization: where,
          status: 'ACTIVE',
        },
      }),
      this.prisma.organization.count({
        where: {
          ...where,
          parentOrganizationId: { not: null },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.id,
      })),
      byType: byType.map((item) => ({
        type: item.type,
        count: item._count.id,
      })),
      members: {
        total: totalMembers,
        active: activeMembers,
      },
      children: totalChildren,
    };
  }
  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateOrganizationsCache(organizationId?: string): Promise<void> {
    try {
      // Invalidate all organization tags
      await this.cacheService.invalidateByTag('organizations');
      await this.cacheService.invalidateByTag('members');
      await this.cacheService.invalidateByTag('stats');

      if (organizationId) {
        // Invalidate specific organization caches
        await this.cacheService.delete(`organization:${organizationId}`);
        await this.cacheService.invalidatePattern(
          `organization:${organizationId}:members:*`,
        );
        await this.cacheService.invalidatePattern(
          `organizations:*:${organizationId}:*`,
        );

        // Get organization to invalidate institution cache
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { institutionId: true },
        });
        if (org) {
          await this.cacheService.delete(`institution:${org.institutionId}`);
        }
      }

      // Also invalidate all patterns
      await this.cacheService.invalidatePattern('organization:*');
      await this.cacheService.invalidatePattern('organizations:*');
      await this.cacheService.invalidatePattern('organization:slug:*');

      this.logger.log(
        `Organizations cache invalidated${organizationId ? ` for organization: ${organizationId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate organizations cache: ${error.message}`,
      );
    }
  }
}
