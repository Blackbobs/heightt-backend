import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getAuditLogs(
    page: number = 1,
    limit: number = 10,
    filters?: {
      userId?: string;
      action?: string;
      entity?: string;
      entityId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: any = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters?.entity) {
      where.entity = filters.entity;
    }
    if (filters?.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters?.startDate) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(filters.startDate),
      };
    }
    if (filters?.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserAuditLogs(userId: string, page: number = 1, limit: number = 10) {
    return this.getAuditLogs(page, limit, { userId });
  }

  async getEntityAuditLogs(
    entity: string,
    entityId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.getAuditLogs(page, limit, { entity, entityId });
  }

  async getOrganizationAuditLogs(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // Get all users in the organization
    const members = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    return this.getAuditLogs(page, limit, {
      userId: { in: userIds } as any,
    });
  }

  async getAuditSummary(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(endDate) };
    }

    const [total, byAction, byEntity, byUser] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    // Get user details for top users
    const userIds = byUser.map((u) => u.userId).filter(Boolean);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds as string[] } },
      select: {
        id: true,
        email: true,
        username: true,
        profile: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      topActions: byAction.map((a) => ({
        action: a.action,
        count: a._count.id,
      })),
      topEntities: byEntity.map((e) => ({
        entity: e.entity || 'Unknown',
        count: e._count.id,
      })),
      topUsers: byUser.map((u) => ({
        userId: u.userId,
        user: userMap.get(u.userId as string),
        count: u._count.id,
      })),
    };
  }
}
