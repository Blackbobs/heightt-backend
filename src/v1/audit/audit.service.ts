// src/v1/audit/audit.service.ts
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

  // ============================================
  // GET AUDIT LOGS
  // ============================================

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

  // ============================================
  // CACHE INVALIDATION
  // ============================================

  async logAuditEvent(data: {
    userId: string;
    action: string;
    entity?: string;
    entityId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    this.logger.log(`Logging audit event: ${data.action}`);

    const auditLog = await this.prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        metadata: data.details,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        createdAt: new Date(),
      },
    });

    // Invalidate audit cache in the background
    setImmediate(async () => {
      try {
        await this.cacheService.invalidateByTag('audit');
        await this.cacheService.invalidateByTag('audit-logs');
        this.logger.debug('Audit cache invalidated after new log entry');
      } catch (error) {
        this.logger.warn(`Failed to invalidate audit cache: ${error.message}`);
      }
    });

    return auditLog;
  }

  async invalidateAuditCache(tags?: string[]): Promise<void> {
    try {
      const tagsToInvalidate = tags || ['audit', 'audit-logs', 'audit-user', 'audit-entity', 'audit-organization', 'audit-summary'];
      
      for (const tag of tagsToInvalidate) {
        await this.cacheService.invalidateByTag(tag);
      }
      
      this.logger.log(`Audit cache invalidated for tags: ${tagsToInvalidate.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate audit cache: ${error.message}`);
    }
  }

  async invalidateAuditCacheForUser(userId: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTag('audit-user');
      await this.cacheService.invalidateByTag('audit');
      await this.cacheService.deletePattern(`audit:user:${userId}:*`);
      this.logger.debug(`Invalidated audit cache for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate audit cache for user: ${error.message}`);
    }
  }

  async invalidateAuditCacheForEntity(entity: string, entityId: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTag('audit-entity');
      await this.cacheService.invalidateByTag('audit');
      await this.cacheService.delete(`audit:entity:${entity}:${entityId}`);
      this.logger.debug(`Invalidated audit cache for entity: ${entity}:${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate audit cache for entity: ${error.message}`);
    }
  }
}