// src/v1/communication/announcement.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EventService, SystemEvents } from '../../events/event.service';
import { PermissionService } from '../auth/permission.service';

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationService: NotificationService,
    private readonly eventService: EventService,
    private readonly permissionService: PermissionService,
  ) {}

  // ============================================
  // CHECK PERMISSION HELPER
  // ============================================

  private async hasAnnouncementPermission(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    // Check if user is a Platform Admin
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (isPlatformAdmin) {
      return true;
    }

    // Check if user is an organization admin or staff
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (membership) {
      return true;
    }

    // Check the RBAC admin-permission system (the same source AdminGuard
    // checks). Users granted 'communication:create' (e.g. FACULTY_ADMIN)
    // can manage announcements; resourceId scoping still applies when a
    // grant specifies one.
    return this.permissionService.checkPermission(
      userId,
      'communication:create',
      organizationId,
    );
  }

  // ============================================
  // CREATE ANNOUNCEMENT
  // ============================================

  async createAnnouncement(
    userId: string,
    data: {
      organizationId: string;
      title: string;
      content: string;
      type?: string;
      priority?: string;
      expiresAt?: string;
    },
  ) {
    this.logger.log(`Creating announcement: ${data.title}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission (Platform Admin OR Organization Admin/Staff)
    const hasPermission = await this.hasAnnouncementPermission(
      userId,
      data.organizationId,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to create announcements',
      );
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        organizationId: data.organizationId,
        authorId: userId,
        title: data.title,
        content: data.content,
        type: (data.type as any) || 'GENERAL',
        priority: (data.priority as any) || 'NORMAL',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        isPublished: false,
      },
    });

    // Invalidate announcement cache
    await this.invalidateAnnouncementCache();

    this.eventService.emit(SystemEvents.ANNOUNCEMENT_CREATED, {
      announcement,
      organization,
    });

    this.logger.log(`Announcement created: ${announcement.id}`);
    return announcement;
  }

  // ============================================
  // GET ANNOUNCEMENTS
  // ============================================

  async getAnnouncements(
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
    filters?: { isPublished?: boolean; type?: string; priority?: string },
  ) {
    const where: any = {};
    if (organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          type: true,
          institutionId: true,
          facultyId: true,
          departmentId: true,
        },
      });
      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      // A hierarchy organization represents its whole scope. For example, a
      // faculty feed includes announcements created by its level/department
      // organizations as well as announcements created directly on faculty.
      switch (organization.type) {
        case 'INSTITUTION':
          where.OR = [
            { organizationId },
            { organization: { institutionId: organization.institutionId } },
          ];
          break;
        case 'FACULTY':
          where.OR = [
            { organizationId },
            { organization: { facultyId: organization.facultyId } },
          ];
          break;
        case 'DEPARTMENT':
          where.OR = [
            { organizationId },
            { organization: { departmentId: organization.departmentId } },
          ];
          break;
        default:
          where.organizationId = organizationId;
      }
    }
    if (filters?.isPublished !== undefined) {
      where.isPublished = filters.isPublished;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.priority) {
      where.priority = filters.priority;
    }

    // REMOVED: Expiration filter - now showing all announcements including expired ones
    // where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];

    const skip = (page - 1) * limit;
    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          author: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
          reads: {
            select: {
              userId: true,
              readAt: true,
            },
          },
        },
        orderBy: [
          { priority: 'desc' }, // URGENT first, then HIGH, NORMAL, LOW
          { publishedAt: 'desc' }, // Newest first
        ],
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return {
      data: announcements,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAnnouncementById(id: string, userId?: string) {
    // Try cache first
    const cacheKey = `announcement:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
        reads: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Cache for 10 minutes
    await this.cacheService.set(cacheKey, announcement, 600);

    // Check if expired (for informational purposes)
    if (announcement.expiresAt && announcement.expiresAt < new Date()) {
      return { ...announcement, isExpired: true };
    }

    return announcement;
  }

  async getOrganizationAnnouncements(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.getAnnouncements(organizationId, page, limit, {
      isPublished: true,
    });
  }

  // ============================================
  // UPDATE ANNOUNCEMENT
  // ============================================

  async updateAnnouncement(
    id: string,
    userId: string,
    data: {
      title?: string;
      content?: string;
      type?: string;
      priority?: string;
      expiresAt?: string;
    },
  ) {
    this.logger.log(`Updating announcement: ${id}`);

    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Check if user has permission (Platform Admin OR Organization Admin/Staff)
    const hasPermission = await this.hasAnnouncementPermission(
      userId,
      announcement.organizationId,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to update this announcement',
      );
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        type: data.type as any,
        priority: data.priority as any,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });

    // Invalidate announcement cache
    await this.invalidateAnnouncementCache(id);

    this.logger.log(`Announcement updated: ${id}`);
    return updated;
  }

  // ============================================
  // PUBLISH ANNOUNCEMENT
  // ============================================

  async publishAnnouncement(id: string, userId: string) {
    this.logger.log(`Publishing announcement: ${id}`);

    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.isPublished) {
      throw new BadRequestException('Announcement is already published');
    }

    // Check if user has permission (Platform Admin OR Organization Admin/Staff)
    const hasPermission = await this.hasAnnouncementPermission(
      userId,
      announcement.organizationId,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to publish this announcement',
      );
    }

    const published = await this.prisma.announcement.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
      include: {
        organization: true,
      },
    });

    // Invalidate announcement cache
    await this.invalidateAnnouncementCache(id);

    // Send notifications via event
    this.eventService.emit(SystemEvents.ANNOUNCEMENT_PUBLISHED, {
      announcement: published,
      organization: published.organization,
    });

    this.logger.log(`Announcement published: ${id}`);
    return published;
  }

  // ============================================
  // MARK AS READ
  // ============================================

  async markAsRead(announcementId: string, userId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const read = await this.prisma.announcementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId,
        },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        announcementId,
        userId,
        readAt: new Date(),
      },
    });

    // Invalidate announcement cache
    await this.invalidateAnnouncementCache(announcementId);

    // Emit event for analytics
    this.eventService.emit(SystemEvents.ANNOUNCEMENT_READ, {
      announcementId,
      userId,
      readAt: read.readAt,
    });

    this.logger.log(
      `Announcement ${announcementId} marked as read by ${userId}`,
    );
    return read;
  }

  // ============================================
  // DELETE ANNOUNCEMENT
  // ============================================

  async deleteAnnouncement(id: string, userId: string) {
    this.logger.log(`Deleting announcement: ${id}`);

    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Check if user has permission (Platform Admin OR Organization Admin/Staff)
    const hasPermission = await this.hasAnnouncementPermission(
      userId,
      announcement.organizationId,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to delete this announcement',
      );
    }

    const deleted = await this.prisma.announcement.delete({
      where: { id },
    });

    // Invalidate announcement cache
    await this.invalidateAnnouncementCache(id);

    this.logger.log(`Announcement deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // ANNOUNCEMENT STATS
  // ============================================

  async getAnnouncementStats(organizationId?: string) {
    const cacheKey = `announcement:stats:${organizationId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const [total, published, drafts, reads] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.count({
        where: { ...where, isPublished: true },
      }),
      this.prisma.announcement.count({
        where: { ...where, isPublished: false },
      }),
      this.prisma.announcementRead.count({
        where: {
          announcement: where,
        },
      }),
    ]);

    const stats = {
      total,
      published,
      drafts,
      totalReads: reads,
      engagementRate:
        published > 0 ? Math.round((reads / (published * 10)) * 100) : 0,
    };

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, stats, 300);
    return stats;
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateAnnouncementCache(announcementId?: string): Promise<void> {
    try {
      // Invalidate tags
      await this.cacheService.invalidateByTag('announcements');
      await this.cacheService.invalidateByTag('communication');
      await this.cacheService.invalidateByTag('dashboard');

      // Delete specific announcement if ID provided
      if (announcementId) {
        await this.cacheService.delete(`announcement:${announcementId}`);
      }

      // Invalidate stats cache
      await this.cacheService.invalidatePattern('announcement:stats:*');

      this.logger.debug(
        `Announcement cache invalidated${announcementId ? ` for: ${announcementId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate announcement cache: ${error.message}`,
      );
    }
  }
}
