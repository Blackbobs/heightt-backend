// src/v1/search/search.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import {
  SearchQueryDto,
  SearchResultDto,
  SearchResponseDto,
  AutoCompleteDto,
} from './dto/search.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // MAIN SEARCH
  // ============================================

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const startTime = Date.now();
    const {
      q,
      entityType,
      page = 1,
      limit = 10,
      institutionId,
      organizationId,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    } = dto;

    // Check cache for common searches
    const cacheKey = `search:${q}:${entityType || 'all'}:${page}:${limit}:${institutionId || 'all'}:${organizationId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Search cache hit for: ${q}`);
      return cached;
    }

    let results: SearchResultDto[] = [];
    let total = 0;
    const facets = {
      users: 0,
      organizations: 0,
      students: 0,
      institutions: 0,
      transactions: 0,
      payments: 0,
      dues: 0,
      events: 0,
      announcements: 0,
    };

    // Determine which entity types to search
    const entityTypes =
      entityType === 'all'
        ? [
            'users',
            'organizations',
            'students',
            'institutions',
            'transactions',
            'payments',
            'dues',
            'events',
            'announcements',
          ]
        : [entityType];

    // Execute searches in parallel
    const searchPromises = entityTypes.map(async (type) => {
      let result;
      let count = 0;
      switch (type) {
        case 'users':
          result = await this.searchUsers(q, institutionId, page, limit);
          count = result.total;
          facets.users = count;
          break;
        case 'organizations':
          result = await this.searchOrganizations(
            q,
            institutionId,
            organizationId,
            page,
            limit,
          );
          count = result.total;
          facets.organizations = count;
          break;
        case 'students':
          result = await this.searchStudents(q, institutionId, page, limit);
          count = result.total;
          facets.students = count;
          break;
        case 'institutions':
          result = await this.searchInstitutions(q, page, limit);
          count = result.total;
          facets.institutions = count;
          break;
        case 'transactions':
          result = await this.searchTransactions(
            q,
            dateFrom,
            dateTo,
            page,
            limit,
          );
          count = result.total;
          facets.transactions = count;
          break;
        case 'payments':
          result = await this.searchPayments(q, dateFrom, dateTo, page, limit);
          count = result.total;
          facets.payments = count;
          break;
        case 'dues':
          result = await this.searchDues(q, organizationId, page, limit);
          count = result.total;
          facets.dues = count;
          break;
        case 'events':
          result = await this.searchEvents(q, dateFrom, dateTo, page, limit);
          count = result.total;
          facets.events = count;
          break;
        case 'announcements':
          result = await this.searchAnnouncements(
            q,
            organizationId,
            page,
            limit,
          );
          count = result.total;
          facets.announcements = count;
          break;
      }

      if (result) {
        results = [...results, ...result.data];
        total += result.total;
      }
    });

    await Promise.all(searchPromises);

    // Sort results if needed
    if (sortBy === 'date') {
      results.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
    } else if (sortBy === 'name') {
      results.sort((a, b) => {
        const nameA = a.title.toLowerCase();
        const nameB = b.title.toLowerCase();
        return sortOrder === 'desc'
          ? nameB.localeCompare(nameA)
          : nameA.localeCompare(nameB);
      });
    }

    // Paginate combined results
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedResults = results.slice(start, end);

    const response: SearchResponseDto = {
      data: paginatedResults,
      meta: {
        query: q,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        took: Date.now() - startTime,
        entityType,
      },
      facets,
    };

    // Cache for 5 minutes
    await this.cacheService.setWithTag(cacheKey, response, ['search'], 300);

    return response;
  }

  // ============================================
  // ENTITY SEARCH METHODS
  // ============================================

  private async searchUsers(
    query: string,
    institutionId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (institutionId) {
      where.studentProfile = { institutionId };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...where,
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
          profile: true,
          createdAt: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.user.count({
        where: {
          ...where,
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
      data: users.map((user) => ({
        id: user.id,
        type: 'user',
        title: user.profile?.firstName
          ? `${user.profile.firstName} ${user.profile.lastName || ''}`
          : user.username,
        description: user.email,
        url: `/users/${user.id}`,
        image: user.profile?.avatar,
        score: this.calculateRelevance(
          query,
          user.username,
          user.email,
          user.profile?.firstName,
          user.profile?.lastName,
        ),
        createdAt: user.createdAt,
        metadata: {
          username: user.username,
          email: user.email,
        },
      })),
      total,
    };
  }

  private async searchOrganizations(
    query: string,
    institutionId?: string,
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (institutionId) {
      where.institutionId = institutionId;
    }
    if (organizationId) {
      where.id = organizationId;
    }

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where: {
          ...where,
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
          createdAt: true,
          institutionId: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.organization.count({
        where: {
          ...where,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    // Get institution names
    const institutionIds = organizations
      .map((o) => o.institutionId)
      .filter(Boolean);
    const institutions = await this.prisma.institution.findMany({
      where: { id: { in: institutionIds } },
      select: { id: true, name: true },
    });
    const instMap = new Map(institutions.map((i) => [i.id, i.name]));

    return {
      data: organizations.map((org) => ({
        id: org.id,
        type: 'organization',
        title: org.name,
        description: org.description || instMap.get(org.institutionId) || '',
        url: `/organizations/${org.slug}`,
        image: null,
        score: this.calculateRelevance(query, org.name, org.description),
        createdAt: org.createdAt,
        metadata: {
          slug: org.slug,
          institution: instMap.get(org.institutionId) || '',
        },
      })),
      total,
    };
  }

  private async searchStudents(
    query: string,
    institutionId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [students, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: {
          ...where,
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
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
          institution: { select: { name: true } },
          department: { select: { name: true } },
          currentAcademicLevel: { select: { name: true } },
          createdAt: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.studentProfile.count({
        where: {
          ...where,
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
      data: students.map((student) => ({
        id: student.id,
        type: 'student',
        title: student.user?.profile?.firstName
          ? `${student.user.profile.firstName} ${student.user.profile.lastName || ''}`
          : student.user?.username || 'Unknown',
        description: `Matric: ${student.matricNumber || 'N/A'} | ${student.institution?.name || ''}`,
        url: `/students/${student.id}`,
        image: student.user?.profile?.avatar,
        score: this.calculateRelevance(
          query,
          student.user?.username,
          student.matricNumber,
          student.user?.profile?.firstName,
          student.user?.profile?.lastName,
        ),
        createdAt: student.createdAt,
        metadata: {
          matricNumber: student.matricNumber,
          institution: student.institution?.name,
          department: student.department?.name,
          level: student.currentAcademicLevel?.name,
        },
      })),
      total,
    };
  }

  private async searchInstitutions(
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
          city: true,
          state: true,
          country: true,
          createdAt: true,
        },
        skip,
        take: limit,
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
      data: institutions.map((inst) => ({
        id: inst.id,
        type: 'institution',
        title: inst.name,
        description: `${inst.city || ''} ${inst.state || ''} ${inst.country || ''}`,
        url: `/institutions/${inst.id}`,
        image: inst.logo,
        score: this.calculateRelevance(
          query,
          inst.name,
          inst.shortName,
          inst.code,
        ),
        createdAt: inst.createdAt,
        metadata: {
          code: inst.code,
          shortName: inst.shortName,
          location: `${inst.city || ''} ${inst.state || ''}`,
        },
      })),
      total,
    };
  }

  private async searchTransactions(
    query: string,
    dateFrom?: string,
    dateTo?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          ...where,
          OR: [
            { reference: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          reference: true,
          amount: true,
          type: true,
          status: true,
          description: true,
          createdAt: true,
          wallet: {
            select: {
              user: { select: { username: true } },
              organization: { select: { name: true } },
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({
        where: {
          ...where,
          OR: [
            { reference: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: transactions.map((tx) => ({
        id: tx.id,
        type: 'transaction',
        title: `Transaction ${tx.reference}`,
        description: `${tx.type} - ${tx.amount} Kobo - ${tx.status}`,
        url: `/transactions/${tx.id}`,
        score: this.calculateRelevance(query, tx.reference, tx.description),
        createdAt: tx.createdAt,
        metadata: {
          reference: tx.reference,
          amount: tx.amount,
          type: tx.type,
          status: tx.status,
          wallet:
            tx.wallet?.user?.username ||
            tx.wallet?.organization?.name ||
            'Unknown',
        },
      })),
      total,
    };
  }

  private async searchPayments(
    query: string,
    dateFrom?: string,
    dateTo?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          ...where,
          OR: [
            { reference: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          description: true,
          createdAt: true,
          payer: { select: { username: true } },
          organization: { select: { name: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({
        where: {
          ...where,
          OR: [
            { reference: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: payments.map((payment) => ({
        id: payment.id,
        type: 'payment',
        title: `Payment ${payment.reference}`,
        description: `₦${(payment.amount / 100).toFixed(2)} - ${payment.status}`,
        url: `/payments/${payment.id}`,
        score: this.calculateRelevance(
          query,
          payment.reference,
          payment.description,
        ),
        createdAt: payment.createdAt,
        metadata: {
          reference: payment.reference,
          amount: payment.amount,
          status: payment.status,
          payer: payment.payer?.username || 'Unknown',
          organization: payment.organization?.name || 'Unknown',
        },
      })),
      total,
    };
  }

  private async searchDues(
    query: string,
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const [dues, total] = await Promise.all([
      this.prisma.due.findMany({
        where: {
          ...where,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          amount: true,
          status: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.due.count({
        where: {
          ...where,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: dues.map((due) => ({
        id: due.id,
        type: 'due',
        title: due.name,
        description: `₦${(due.amount / 100).toFixed(2)}`,
        url: `/dues/${due.id}`,
        score: this.calculateRelevance(query, due.name, due.description),
        createdAt: due.createdAt,
        metadata: {
          amount: due.amount,
          status: due.status,
          organization: due.organization?.name || 'Unknown',
        },
      })),
      total,
    };
  }

  private async searchEvents(
    query: string,
    dateFrom?: string,
    dateTo?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (dateFrom) {
      where.startDate = { ...where.startDate, gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.startDate = { ...where.startDate, lte: new Date(dateTo) };
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          ...where,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { location: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.event.count({
        where: {
          ...where,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { location: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: events.map((event) => ({
        id: event.id,
        type: 'event',
        title: event.title,
        description: `${event.location || ''} - ${event.startDate.toLocaleDateString()}`,
        url: `/events/${event.id}`,
        score: this.calculateRelevance(
          query,
          event.title,
          event.description,
          event.location,
        ),
        createdAt: event.createdAt,
        metadata: {
          location: event.location,
          startDate: event.startDate,
          endDate: event.endDate,
          status: event.status,
          organization: event.organization?.name || 'Unknown',
        },
      })),
      total,
    };
  }

  private async searchAnnouncements(
    query: string,
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where: {
          ...where,
          isPublished: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
          priority: true,
          publishedAt: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.announcement.count({
        where: {
          ...where,
          isPublished: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data: announcements.map((announcement) => ({
        id: announcement.id,
        type: 'announcement',
        title: announcement.title,
        description: announcement.content.substring(0, 150) + '...',
        url: `/announcements/${announcement.id}`,
        score: this.calculateRelevance(
          query,
          announcement.title,
          announcement.content,
        ),
        createdAt: announcement.createdAt,
        metadata: {
          priority: announcement.priority,
          publishedAt: announcement.publishedAt,
          organization: announcement.organization?.name || 'Unknown',
        },
      })),
      total,
    };
  }

  // ============================================
  // AUTOCOMPLETE
  // ============================================

  async autocomplete(dto: AutoCompleteDto) {
    const { q, limit = 5, institutionId } = dto;
    const cacheKey = `autocomplete:${q}:${institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [users, organizations, institutions] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { profile: { firstName: { contains: q, mode: 'insensitive' } } },
            { profile: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          username: true,
          profile: true,
        },
        take: limit,
      }),
      this.prisma.organization.findMany({
        where: {
          ...(institutionId ? { institutionId } : {}),
          name: { contains: q, mode: 'insensitive' },
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
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
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

    const results = {
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
        url: `/organizations/${o.slug}`,
      })),
      institutions: institutions.map((i) => ({
        id: i.id,
        label: `${i.name} (${i.code})`,
        type: 'institution',
      })),
    };

    await this.cacheService.setWithTag(cacheKey, results, ['search'], 300);
    return results;
  }

  // ============================================
  // SEARCH SUGGESTIONS
  // ============================================

  async getSuggestions(query: string) {
    const suggestions = [
      `${query} department`,
      `${query} faculty`,
      `${query} students`,
      `${query} organization`,
      `${query} payment`,
      `${query} due`,
    ];
    return suggestions;
  }

  // ============================================
  // SEARCH HISTORY
  // ============================================

  async saveSearchHistory(userId: string, query: string, entityType?: string) {
    // Store in Redis for recent searches
    const key = `search:history:${userId}`;
    const history = (await this.cacheService.get<any[]>(key)) || [];

    const entry = {
      query,
      entityType,
      timestamp: new Date().toISOString(),
    };

    // Add to front and keep only last 20
    const newHistory = [
      entry,
      ...history.filter((h: any) => h.query !== query),
    ].slice(0, 20);
    await this.cacheService.set(key, newHistory, 86400); // 24 hours

    return newHistory;
  }

  async getSearchHistory(userId: string) {
    const key = `search:history:${userId}`;
    return (await this.cacheService.get<any[]>(key)) || [];
  }

  async clearSearchHistory(userId: string) {
    const key = `search:history:${userId}`;
    await this.cacheService.delete(key);
    return { message: 'Search history cleared' };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private calculateRelevance(
    query: string,
    ...fields: (string | null | undefined)[]
  ): number {
    const normalizedQuery = query.toLowerCase().trim();
    let maxScore = 0;

    for (const field of fields) {
      if (!field) continue;
      const normalizedField = field.toLowerCase();

      if (normalizedField === normalizedQuery) {
        maxScore = Math.max(maxScore, 100);
      } else if (normalizedField.startsWith(normalizedQuery)) {
        maxScore = Math.max(maxScore, 75);
      } else if (normalizedField.includes(normalizedQuery)) {
        maxScore = Math.max(maxScore, 50);
      } else if (
        normalizedField.split(' ').some((word) => word === normalizedQuery)
      ) {
        maxScore = Math.max(maxScore, 60);
      } else if (
        normalizedField
          .split(' ')
          .some((word) => word.includes(normalizedQuery))
      ) {
        maxScore = Math.max(maxScore, 40);
      }
    }

    return maxScore;
  }

  // ============================================
  // CACHE INVALIDATION
  // ============================================

  async invalidateSearchCache() {
    try {
      await this.cacheService.invalidateByTag('search');
      await this.cacheService.invalidatePattern('search:*');
      await this.cacheService.invalidatePattern('autocomplete:*');
      this.logger.log('Search cache invalidated');
    } catch (error) {
      this.logger.error(`Failed to invalidate search cache: ${error.message}`);
    }
  }
}
