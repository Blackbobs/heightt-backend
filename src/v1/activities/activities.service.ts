// src/v1/activities/activities.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { NotificationService } from '../communication/notification.service';
import {
  CreateActivityDto,
  UpdateActivityDto,
  RegisterActivityDto,
} from './dto';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  // ============================================
  // ACTIVITY MANAGEMENT WITH CACHE INVALIDATION
  // ============================================

  async createActivity(userId: string, dto: CreateActivityDto) {
    this.logger.log(`Creating activity: ${dto.title}`);

    if (dto.organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: dto.organizationId },
      });

      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: dto.organizationId,
          membershipType: { in: ['ADMIN', 'STAFF'] },
          status: 'ACTIVE',
        },
      });

      const isPlatformAdmin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          adminType: 'PLATFORM_ADMIN',
        },
      });

      if (!membership && !isPlatformAdmin) {
        throw new ForbiddenException(
          'You do not have permission to create activities for this organization',
        );
      }
    }

    const isPublic = dto.isPublic !== undefined ? dto.isPublic : true;

    const activity = await this.prisma.event.create({
      data: {
        organizationId: dto.organizationId || null,
        createdBy: userId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        capacity: dto.capacity,
        isFree: dto.isFree !== undefined ? dto.isFree : true,
        price: dto.price ? dto.price : 0,
        isPublic: isPublic,
        isApproved: true,
        status: (dto.status || 'PUBLISHED') as any,
      },
    });

    // Invalidate activity caches
    await this.invalidateActivityCaches(activity.id, dto.organizationId);

    if (dto.organizationId) {
      const members = await this.prisma.organizationMembership.findMany({
        where: {
          organizationId: dto.organizationId,
          status: 'ACTIVE',
        },
        select: { userId: true },
      });

      await this.notificationService.createBulkNotifications(
        members.map((m) => m.userId),
        {
          title: `📅 New Activity: ${activity.title}`,
          body: `${activity.title} has been created! ${activity.description || 'Check it out now.'}`,
          type: 'EVENT',
          priority: 'NORMAL',
          data: {
            activityId: activity.id,
            organizationId: activity.organizationId,
            startDate: activity.startDate,
          },
          sendEmail: false,
        },
      );
    }

    await this.notificationService.createNotification(userId, {
      title: '✅ Activity Created Successfully!',
      body: `Your activity "${activity.title}" has been created and is now live for everyone to see.`,
      type: 'EVENT',
      priority: 'NORMAL',
      data: {
        activityId: activity.id,
      },
      sendEmail: true,
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACTIVITY_CREATED',
        details: JSON.stringify({
          activityId: activity.id,
          title: activity.title,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.logger.log(`Activity created: ${activity.id}`);
    return activity;
  }

  async getActivities(
    userId?: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      isFree?: boolean;
      isPublic?: boolean;
      organizationId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const where: any = {
      isApproved: true,
    };

    if (filters?.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters?.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.isFree !== undefined) {
      where.isFree = filters.isFree;
    }
    if (filters?.startDate) {
      where.startDate = { gte: new Date(filters.startDate) };
    }
    if (filters?.endDate) {
      where.endDate = { lte: new Date(filters.endDate) };
    }
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    where.endDate = { gt: new Date() };

    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      this.prisma.event.findMany({
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
          creator: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
          registrations: {
            where: { status: 'CONFIRMED' },
            select: {
              id: true,
              userId: true,
              registeredAt: true,
            },
          },
          tickets: {
            where: { isUsed: false },
            select: { id: true, code: true },
          },
          _count: {
            select: {
              registrations: {
                where: { status: 'CONFIRMED' },
              },
              tickets: true,
            },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: activities,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPublicActivities(
    page: number = 1,
    limit: number = 10,
    filters?: {
      search?: string;
      startDate?: string;
      endDate?: string;
      organizationId?: string;
    },
  ) {
    const where: any = {
      isPublic: true,
      isApproved: true,
      status: 'PUBLISHED',
    };

    if (filters?.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.startDate) {
      where.startDate = { gte: new Date(filters.startDate) };
    }
    if (filters?.endDate) {
      where.endDate = { lte: new Date(filters.endDate) };
    }

    where.endDate = { gt: new Date() };

    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              registrations: {
                where: { status: 'CONFIRMED' },
              },
            },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: activities,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getActivityById(id: string) {
    const cacheKey = `activity:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const activity = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
          },
        },
        registrations: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
            ticketPurchase: {
              include: {
                ticket: true,
              },
            },
            attendance: true,
          },
          orderBy: { registeredAt: 'desc' },
        },
        tickets: {
          where: { isUsed: false },
          select: { id: true, code: true, type: true, price: true },
        },
        _count: {
          select: {
            registrations: {
              where: { status: 'CONFIRMED' },
            },
            tickets: true,
          },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    await this.cacheService.set(cacheKey, activity, 300);
    return activity;
  }

  async updateActivity(id: string, userId: string, dto: UpdateActivityDto) {
    this.logger.log(`Updating activity: ${id}`);

    const activity = await this.prisma.event.findUnique({
      where: { id },
      include: { organization: true, creator: true },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    const canUpdate = await this.canUpdateActivity(activity, userId);
    if (!canUpdate) {
      throw new ForbiddenException(
        'You do not have permission to update this activity',
      );
    }

    if (activity.status === 'COMPLETED' || activity.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot update a completed or cancelled activity',
      );
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        capacity: dto.capacity,
        isFree: dto.isFree,
        price: dto.price,
        status: dto.status as any,
        isPublic: dto.isPublic !== undefined ? dto.isPublic : activity.isPublic,
        isApproved: true,
      },
    });

    // Invalidate activity caches
    await this.invalidateActivityCaches(id, activity.organizationId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACTIVITY_UPDATED',
        details: JSON.stringify({
          activityId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Activity updated: ${id}`);
    return updated;
  }

  private async canUpdateActivity(
    activity: any,
    userId: string,
  ): Promise<boolean> {
    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });
    if (isPlatformAdmin) return true;

    if (activity.organizationId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: activity.organizationId,
          membershipType: { in: ['ADMIN', 'STAFF'] },
          status: 'ACTIVE',
        },
      });
      if (membership) return true;
    }

    if (activity.createdBy === userId) {
      return true;
    }

    return false;
  }

  async publishActivity(id: string, userId: string) {
    this.logger.log(`Publishing activity: ${id}`);

    const activity = await this.prisma.event.findUnique({
      where: { id },
      include: { organization: true, creator: true },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    const canPublish = await this.canUpdateActivity(activity, userId);
    if (!canPublish) {
      throw new ForbiddenException(
        'You do not have permission to publish this activity',
      );
    }

    if (activity.status === 'PUBLISHED') {
      throw new BadRequestException('Activity is already published');
    }

    const published = await this.prisma.event.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
      },
    });

    // Invalidate activity caches
    await this.invalidateActivityCaches(id, activity.organizationId);

    if (activity.organizationId) {
      const members = await this.prisma.organizationMembership.findMany({
        where: {
          organizationId: activity.organizationId,
          status: 'ACTIVE',
        },
        select: { userId: true },
      });

      await this.notificationService.createBulkNotifications(
        members.map((m) => m.userId),
        {
          title: `📅 Activity Published: ${activity.title}`,
          body: `${activity.title} has been published! ${activity.description || 'Check it out now.'}`,
          type: 'EVENT',
          priority: 'NORMAL',
          data: {
            activityId: activity.id,
            organizationId: activity.organizationId,
            startDate: activity.startDate,
          },
          sendEmail: false,
        },
      );
    }

    this.logger.log(`Activity published: ${id}`);
    return published;
  }

  async deleteActivity(id: string, userId: string) {
    this.logger.log(`Deleting activity: ${id}`);

    const activity = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organization: true,
        registrations: true,
        tickets: true,
        creator: true,
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    const canDelete = await this.canUpdateActivity(activity, userId);
    if (!canDelete) {
      throw new ForbiddenException(
        'You do not have permission to delete this activity',
      );
    }

    if (activity.registrations.length > 0) {
      throw new BadRequestException(
        'Cannot delete activity with registrations',
      );
    }

    const deleted = await this.prisma.event.delete({
      where: { id },
    });

    // Invalidate activity caches
    await this.invalidateActivityCaches(id, activity.organizationId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACTIVITY_DELETED',
        details: JSON.stringify({
          activityId: id,
          title: activity.title,
        }),
      },
    });

    this.logger.log(`Activity deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  private async invalidateActivityCaches(activityId: string, organizationId?: string | null) {
    try {
      // Delete specific activity cache
      await this.cacheService.delete(`activity:${activityId}`);
      
      // Invalidate activity tags
      await this.cacheService.invalidateByTag('activities');
      await this.cacheService.invalidateByTag('public');
      await this.cacheService.invalidateByTag('activity-detail');
      
      // If organization-specific, invalidate organization dashboard
      if (organizationId) {
        await this.cacheService.invalidateByTag(`organization-dashboard`);
        await this.cacheService.invalidateByTag(`organization:${organizationId}`);
      }
      
      this.logger.debug(`Invalidated activity caches for: ${activityId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate activity caches: ${error.message}`);
    }
  }

  // ============================================
  // REGISTRATION
  // ============================================

  async registerForActivity(
    userId: string,
    activityId: string,
    dto: RegisterActivityDto,
  ) {
    this.logger.log(`Registering user ${userId} for activity ${activityId}`);

    const activity = await this.prisma.event.findUnique({
      where: { id: activityId },
      include: {
        organization: true,
        tickets: {
          where: { isUsed: false },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    if (activity.status !== 'PUBLISHED') {
      throw new BadRequestException('Activity is not open for registration');
    }

    if (activity.startDate < new Date()) {
      throw new BadRequestException('Activity has already started');
    }

    if (activity.capacity) {
      const confirmedRegistrations = await this.prisma.eventRegistration.count({
        where: {
          eventId: activityId,
          status: 'CONFIRMED',
        },
      });

      const quantity = dto.quantity || 1;
      if (confirmedRegistrations + quantity > activity.capacity) {
        throw new BadRequestException('Activity is at full capacity');
      }
    }

    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId: activityId,
        userId,
        status: { not: 'CANCELLED' },
      },
    });

    if (existing) {
      throw new ConflictException(
        'You are already registered for this activity',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const quantity = dto.quantity || 1;
      let ticketPurchase: any = null;
      const tickets: any[] = [];

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: activityId,
          userId,
          status: activity.isFree ? 'CONFIRMED' : 'PENDING',
          registeredAt: new Date(),
        },
      });

      const price = Number(activity.price) || 0;
      if (!activity.isFree && price > 0) {
        const totalAmount = price * quantity;

        const createdTickets: any[] = [];
        for (let i = 0; i < quantity; i++) {
          const ticket = await tx.ticket.create({
            data: {
              eventId: activityId,
              code: `TKT-${activityId.substring(0, 8)}-${randomBytes(4).toString('hex').toUpperCase()}`,
              type: 'REGULAR',
              price: price,
              isUsed: false,
            },
          });
          createdTickets.push(ticket);
        }

        if (createdTickets.length > 0) {
          ticketPurchase = await tx.ticketPurchase.create({
            data: {
              userId,
              ticketId: createdTickets[0].id,
              amount: totalAmount,
              status: 'PENDING',
              purchasedAt: new Date(),
            },
          });
        }

        tickets.push(...createdTickets);
      }

      return { registration, ticketPurchase, tickets };
    });

    // Invalidate registration and activity caches
    await this.invalidateRegistrationCaches(activityId);

    if (activity.isFree) {
      await this.notificationService.createNotification(userId, {
        title: '🎉 Activity Registration Confirmed!',
        body: `You are registered for ${activity.title}. Check your dashboard for details.`,
        type: 'EVENT',
        priority: 'NORMAL',
        data: {
          activityId: activity.id,
          registrationId: result.registration.id,
        },
        sendEmail: true,
      });
    } else {
      await this.notificationService.createNotification(userId, {
        title: '⏳ Registration Pending Payment',
        body: `Your registration for ${activity.title} is pending payment confirmation.`,
        type: 'EVENT',
        priority: 'NORMAL',
        data: {
          activityId: activity.id,
          registrationId: result.registration.id,
          amount: Number(activity.price),
        },
        sendEmail: true,
      });
    }

    this.logger.log(`User ${userId} registered for activity ${activityId}`);
    return result;
  }

  async confirmRegistration(registrationId: string, userId: string) {
    this.logger.log(`Confirming registration ${registrationId}`);

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: registration.event.organizationId || undefined,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin && registration.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to confirm this registration',
      );
    }

    if (registration.status === 'CONFIRMED') {
      throw new BadRequestException('Registration is already confirmed');
    }

    const confirmed = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'CONFIRMED',
      },
    });

    // Invalidate registration caches
    await this.invalidateRegistrationCaches(registration.eventId);

    await this.notificationService.createNotification(registration.userId, {
      title: '✅ Registration Confirmed!',
      body: `Your registration for ${registration.event.title} has been confirmed.`,
      type: 'EVENT',
      priority: 'NORMAL',
      data: {
        activityId: registration.eventId,
        registrationId: registration.id,
      },
      sendEmail: true,
    });

    this.logger.log(`Registration ${registrationId} confirmed`);
    return confirmed;
  }

  async cancelRegistration(registrationId: string, userId: string) {
    this.logger.log(`Cancelling registration ${registrationId}`);

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: registration.event.organizationId || undefined,
          membershipType: { in: ['ADMIN', 'STAFF'] },
          status: 'ACTIVE',
        },
      });

      const isPlatformAdmin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          adminType: 'PLATFORM_ADMIN',
        },
      });

      if (!membership && !isPlatformAdmin) {
        throw new ForbiddenException(
          'You do not have permission to cancel this registration',
        );
      }
    }

    if (registration.status === 'CANCELLED') {
      throw new BadRequestException('Registration is already cancelled');
    }

    const cancelled = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'CANCELLED',
      },
    });

    // Invalidate registration caches
    await this.invalidateRegistrationCaches(registration.eventId);

    this.logger.log(`Registration ${registrationId} cancelled`);
    return cancelled;
  }

  private async invalidateRegistrationCaches(activityId: string) {
    try {
      await this.cacheService.invalidateByTag('registrations');
      await this.cacheService.invalidateByTag('activities');
      await this.cacheService.delete(`activity:${activityId}`);
      this.logger.debug(`Invalidated registration caches for activity: ${activityId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate registration caches: ${error.message}`);
    }
  }

  // ============================================
  // ATTENDANCE TRACKING
  // ============================================

  async checkInAttendee(registrationId: string, userId: string) {
    this.logger.log(`Checking in attendee ${registrationId}`);

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: registration.event.organizationId || undefined,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to check in attendees',
      );
    }

    if (registration.status !== 'CONFIRMED') {
      throw new BadRequestException('Registration is not confirmed');
    }

    const attendee = await this.prisma.attendance.create({
      data: {
        registrationId,
        checkedInAt: new Date(),
      },
      include: {
        registration: {
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

    // Invalidate attendance and stats caches
    await this.invalidateAttendanceCaches(registration.eventId);

    this.logger.log(`Attendee ${registrationId} checked in`);
    return attendee;
  }

  async checkOutAttendee(attendanceId: string, userId: string) {
    this.logger.log(`Checking out attendee ${attendanceId}`);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        registration: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId:
          attendance.registration.event.organizationId || undefined,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to check out attendees',
      );
    }

    const checkedOut = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkedOutAt: new Date(),
      },
    });

    // Invalidate attendance and stats caches
    await this.invalidateAttendanceCaches(attendance.registration.eventId);

    this.logger.log(`Attendee ${attendanceId} checked out`);
    return checkedOut;
  }

  private async invalidateAttendanceCaches(activityId: string) {
    try {
      await this.cacheService.invalidateByTag('attendance');
      await this.cacheService.invalidateByTag('activity-stats');
      await this.cacheService.invalidateByTag('activities');
      await this.cacheService.delete(`activity:${activityId}`);
      this.logger.debug(`Invalidated attendance caches for activity: ${activityId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate attendance caches: ${error.message}`);
    }
  }

  // ============================================
  // ACTIVITY STATISTICS
  // ============================================

  async getActivityStats(activityId: string, userId: string) {
    const activity = await this.prisma.event.findUnique({
      where: { id: activityId },
      include: {
        organization: true,
        registrations: {
          include: {
            attendance: true,
          },
        },
        tickets: true,
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: activity.organizationId || undefined,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to view activity statistics',
      );
    }

    const totalRegistrations = activity.registrations.length;
    const confirmedRegistrations = activity.registrations.filter(
      (r) => r.status === 'CONFIRMED',
    ).length;
    const checkedInAttendees = activity.registrations.filter(
      (r) => r.attendance !== null,
    ).length;
    const totalTickets = activity.tickets.length;
    const usedTickets = activity.tickets.filter((t) => t.isUsed).length;

    const capacityUtilization = activity.capacity
      ? Math.round((confirmedRegistrations / activity.capacity) * 100)
      : 0;

    const registrationTrend = await this.getRegistrationTrend(activityId);
    const price = Number(activity.price) || 0;

    return {
      activityId: activity.id,
      title: activity.title,
      status: activity.status,
      startDate: activity.startDate,
      endDate: activity.endDate,
      statistics: {
        totalRegistrations,
        confirmedRegistrations,
        checkedInAttendees,
        totalTickets,
        usedTickets,
        capacity: activity.capacity,
        capacityUtilization: activity.capacity ? capacityUtilization : 0,
        isFree: activity.isFree,
        price: price,
        totalRevenue: activity.isFree ? 0 : price * confirmedRegistrations,
      },
      registrationTrend,
      recentRegistrations: activity.registrations.slice(0, 10).map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        registeredAt: r.registeredAt,
        checkedIn: r.attendance !== null,
      })),
    };
  }

  private async getRegistrationTrend(activityId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId: activityId,
        registeredAt: { gte: sevenDaysAgo },
      },
      select: {
        registeredAt: true,
      },
    });

    const trend: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      trend[key] = 0;
    }

    for (const reg of registrations) {
      const key = reg.registeredAt.toISOString().split('T')[0];
      if (trend[key] !== undefined) {
        trend[key]++;
      }
    }

    return Object.entries(trend).map(([date, count]) => ({
      date,
      registrations: count,
    }));
  }

  async getOrganizationActivityDashboard(
    organizationId: string,
    userId: string,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to view this dashboard',
      );
    }

    const [
      totalActivities,
      upcomingActivities,
      pastActivities,
      totalRegistrations,
      totalAttendees,
    ] = await Promise.all([
      this.prisma.event.count({
        where: { organizationId },
      }),
      this.prisma.event.count({
        where: {
          organizationId,
          startDate: { gt: new Date() },
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
      }),
      this.prisma.event.count({
        where: {
          organizationId,
          endDate: { lt: new Date() },
        },
      }),
      this.prisma.eventRegistration.count({
        where: {
          event: { organizationId },
          status: 'CONFIRMED',
        },
      }),
      this.prisma.attendance.count({
        where: {
          registration: {
            event: { organizationId },
          },
        },
      }),
    ]);

    const upcomingActivitiesList = await this.prisma.event.findMany({
      where: {
        organizationId,
        startDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        status: { in: ['PUBLISHED', 'DRAFT'] },
      },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: 'CONFIRMED' },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
      take: 10,
    });

    const recentActivities = await this.prisma.event.findMany({
      where: {
        organizationId,
        endDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: 'CONFIRMED' },
            },
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 10,
    });

    return {
      organizationId,
      statistics: {
        totalActivities,
        upcomingActivities,
        pastActivities,
        totalRegistrations,
        totalAttendees,
        averageAttendance:
          totalActivities > 0
            ? Math.round(totalAttendees / totalActivities)
            : 0,
      },
      upcomingActivities: upcomingActivitiesList.map((a) => ({
        id: a.id,
        title: a.title,
        startDate: a.startDate,
        endDate: a.endDate,
        location: a.location,
        registrations: a._count.registrations,
        capacity: a.capacity,
        status: a.status,
      })),
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        title: a.title,
        startDate: a.startDate,
        endDate: a.endDate,
        location: a.location,
        registrations: a._count.registrations,
        status: a.status,
      })),
    };
  }
}