import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

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
}
