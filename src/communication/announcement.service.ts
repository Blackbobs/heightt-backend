import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { NotificationService } from './notification.service';
import { EventService, SystemEvents } from '../events/event.service';

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationService: NotificationService,
    private readonly eventService: EventService,
  ) {}

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

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: data.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (!membership) {
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
      where.organizationId = organizationId;
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

    // Only show non-expired announcements
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];

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
        orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
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

    // Check if expired
    if (announcement.expiresAt && announcement.expiresAt < new Date()) {
      // Still return but mark as expired
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

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: announcement.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (!membership) {
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

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: announcement.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    if (!membership) {
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

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: announcement.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    // Platform admins can delete any announcement
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this announcement',
      );
    }

    const deleted = await this.prisma.announcement.delete({
      where: { id },
    });

    this.logger.log(`Announcement deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // ANNOUNCEMENT STATS
  // ============================================

  async getAnnouncementStats(organizationId?: string) {
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

    return {
      total,
      published,
      drafts,
      totalReads: reads,
      engagementRate:
        published > 0 ? Math.round((reads / (published * 10)) * 100) : 0,
    };
  }
}
