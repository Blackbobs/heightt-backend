// src/v1/search/search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateSearchCache(): Promise<void> {
    try {
      // Invalidate all search tags
      await this.cacheService.invalidateByTag('search');
      await this.cacheService.invalidateByTag('users');
      await this.cacheService.invalidateByTag('organizations');
      await this.cacheService.invalidateByTag('students');
      await this.cacheService.invalidateByTag('institutions');
      await this.cacheService.invalidateByTag('global');

      // Invalidate all search patterns
      await this.cacheService.invalidatePattern('search:*');

      this.logger.log('Search cache invalidated');
    } catch (error) {
      this.logger.error(`Failed to invalidate search cache: ${error.message}`);
    }
  }

  // ============================================
  // SEARCH USERS
  // ============================================

  async searchUsers(query: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            {
              profile: { firstName: { contains: query, mode: 'insensitive' } },
            },
            { profile: { lastName: { contains: query, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              avatar: true,
              phone: true,
            },
          },
          studentProfile: {
            select: {
              id: true,
              matricNumber: true,
              department: {
                select: { name: true },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            {
              profile: { firstName: { contains: query, mode: 'insensitive' } },
            },
            { profile: { lastName: { contains: query, mode: 'insensitive' } } },
          ],
        },
      }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // SEARCH ORGANIZATIONS
  // ============================================

  async searchOrganizations(
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          type: true,
          status: true,
          institution: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              memberships: {
                where: { status: 'ACTIVE' },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.count({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
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

  // ============================================
  // SEARCH STUDENTS
  // ============================================

  async searchStudents(query: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: {
          OR: [
            { user: { email: { contains: query, mode: 'insensitive' } } },
            { user: { username: { contains: query, mode: 'insensitive' } } },
            {
              user: {
                profile: {
                  firstName: { contains: query, mode: 'insensitive' },
                },
              },
            },
            {
              user: {
                profile: { lastName: { contains: query, mode: 'insensitive' } },
              },
            },
            { matricNumber: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          matricNumber: true,
          academicStatus: true,
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  phone: true,
                },
              },
            },
          },
          institution: {
            select: {
              id: true,
              name: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          currentAcademicLevel: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.count({
        where: {
          OR: [
            { user: { email: { contains: query, mode: 'insensitive' } } },
            { user: { username: { contains: query, mode: 'insensitive' } } },
            {
              user: {
                profile: {
                  firstName: { contains: query, mode: 'insensitive' },
                },
              },
            },
            {
              user: {
                profile: { lastName: { contains: query, mode: 'insensitive' } },
              },
            },
            { matricNumber: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: students,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // SEARCH INSTITUTIONS
  // ============================================

  async searchInstitutions(
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [institutions, total] = await Promise.all([
      this.prisma.institution.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { shortName: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { state: { contains: query, mode: 'insensitive' } },
            { country: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          shortName: true,
          code: true,
          logo: true,
          website: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          country: true,
          status: true,
          _count: {
            select: {
              faculties: true,
              students: true,
              organizations: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.institution.count({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { shortName: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { state: { contains: query, mode: 'insensitive' } },
            { country: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: institutions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // GLOBAL SEARCH
  // ============================================

  async globalSearch(query: string, page: number = 1, limit: number = 10) {
    const [users, organizations, students, institutions] = await Promise.all([
      this.searchUsers(query, page, limit),
      this.searchOrganizations(query, page, limit),
      this.searchStudents(query, page, limit),
      this.searchInstitutions(query, page, limit),
    ]);

    return {
      users: users.data,
      organizations: organizations.data,
      students: students.data,
      institutions: institutions.data,
      meta: {
        page,
        limit,
        totals: {
          users: users.meta.total,
          organizations: organizations.meta.total,
          students: students.meta.total,
          institutions: institutions.meta.total,
        },
      },
    };
  }

  // ============================================
  // ADDITIONAL SEARCH METHODS
  // ============================================

  /**
   * Advanced search with filters
   */
  async advancedSearch(
    query: string,
    filters: {
      entityTypes?: string[];
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      institutionId?: string;
      organizationId?: string;
    },
    page: number = 1,
    limit: number = 10,
  ) {
    const results: any = {};

    if (!filters.entityTypes || filters.entityTypes.includes('users')) {
      results.users = await this.searchUsers(query, page, limit);
    }

    if (!filters.entityTypes || filters.entityTypes.includes('organizations')) {
      results.organizations = await this.searchOrganizations(
        query,
        page,
        limit,
      );
    }

    if (!filters.entityTypes || filters.entityTypes.includes('students')) {
      results.students = await this.searchStudents(query, page, limit);
    }

    if (!filters.entityTypes || filters.entityTypes.includes('institutions')) {
      results.institutions = await this.searchInstitutions(query, page, limit);
    }

    return results;
  }

  /**
   * Search with autocomplete (for type-ahead)
   */
  async autocomplete(query: string, limit: number = 10) {
    const [users, organizations, institutions] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            {
              profile: { firstName: { contains: query, mode: 'insensitive' } },
            },
            { profile: { lastName: { contains: query, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          username: true,
          email: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        take: limit,
      }),
      this.prisma.organization.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        take: limit,
      }),
      this.prisma.institution.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
        take: limit,
      }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        label: u.profile?.firstName
          ? `${u.profile.firstName} ${u.profile.lastName || ''}`
          : u.username,
        type: 'user',
        avatar: u.profile?.avatar,
      })),
      organizations: organizations.map((o) => ({
        id: o.id,
        label: o.name,
        type: 'organization',
      })),
      institutions: institutions.map((i) => ({
        id: i.id,
        label: i.name,
        type: 'institution',
        code: i.code,
      })),
    };
  }

  /**
   * Search by filters (e.g., department, level, etc.)
   */
  async searchByFilters(
    filters: {
      departmentId?: string;
      levelId?: string;
      institutionId?: string;
      facultyId?: string;
      organizationId?: string;
      status?: string;
    },
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = {};

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }
    if (filters.levelId) {
      where.currentAcademicLevelId = filters.levelId;
    }
    if (filters.institutionId) {
      where.institutionId = filters.institutionId;
    }
    if (filters.facultyId) {
      where.facultyId = filters.facultyId;
    }
    if (filters.status) {
      where.academicStatus = filters.status;
    }

    const skip = (page - 1) * limit;
    const [students, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
          institution: true,
          faculty: true,
          department: true,
          currentAcademicLevel: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return {
      data: students,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get search suggestions based on popular searches
   */
  async getSearchSuggestions(query: string): Promise<string[]> {
    // This could be based on recent searches or popular terms
    const suggestions = [
      `${query} department`,
      `${query} faculty`,
      `${query} students`,
      `${query} organization`,
    ];

    return suggestions;
  }
}
