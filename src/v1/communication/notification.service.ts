// src/v1/communication/notification.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from '../../gateways/notification.gateway';
import { EventService, SystemEvents } from '../../events/event.service';
import { EmailService } from '../../email/email.service';
import { CacheService } from '../../redis/cache.service';
import { OnEvent } from '@nestjs/event-emitter';
import { renderHeighttEmail } from '../../email/heightt-email.template';

export interface NotificationPreferenceDto {
  type: string;
  email: boolean;
  push: boolean;
  inApp: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    private readonly eventService: EventService,
    private readonly emailService: EmailService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateNotificationCache(
    userId?: string,
    invalidateSharedTags: boolean = true,
  ): Promise<void> {
    try {
      if (invalidateSharedTags) {
        await Promise.all([
          this.cacheService.invalidateByTag('notifications'),
          this.cacheService.invalidateByTag('communication'),
        ]);
      }

      if (userId) {
        await Promise.all([
          this.cacheService.delete(`notifications:user:${userId}`),
          this.cacheService.delete(`notifications:unread:${userId}`),
          this.cacheService.delete(`notifications:preferences:${userId}`),
          this.cacheService.invalidatePattern(`notifications:user:${userId}:*`),
        ]);
      }

      this.logger.debug(
        `Notification cache invalidated${userId ? ` for user: ${userId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate notification cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // CREATE NOTIFICATION
  // ============================================

  async createNotification(
    userId: string,
    data: {
      title: string;
      body: string;
      type: string;
      priority?: string;
      data?: any;
      sendEmail?: boolean;
      sendPush?: boolean;
    },
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title: data.title,
        body: data.body,
        type: data.type as any,
        priority: (data.priority as any) || 'NORMAL',
        data: data.data || {},
        deliveredAt: new Date(),
      },
    });

    await this.invalidateNotificationCache(userId);

    // Fix: Pass 3 arguments: userId, event, data
    await this.gateway.sendToUser(userId, 'notification', notification);

    if (data.sendEmail !== false) {
      await this.sendEmailNotification(userId, notification);
    }

    this.eventService.emit(SystemEvents.NOTIFICATION_SENT, {
      userId,
      notification,
    });

    this.logger.log(`Notification sent to user ${userId}: ${data.title}`);
    return notification;
  }

  // ============================================
  // BULK NOTIFICATIONS
  // ============================================

  async createBulkNotifications(
    userIds: string[],
    data: {
      title: string;
      body: string;
      type: string;
      priority?: string;
      data?: any;
      sendEmail?: boolean;
    },
  ) {
    const deliveredAt = new Date();
    const notifications = await this.prisma.notification.createManyAndReturn({
      data: userIds.map((userId) => ({
        userId,
        title: data.title,
        body: data.body,
        type: data.type as any,
        priority: (data.priority as any) || 'NORMAL',
        data: data.data || {},
        deliveredAt,
      })),
    });

    await Promise.all([
      this.cacheService.invalidateByTag('notifications'),
      this.cacheService.invalidateByTag('communication'),
    ]);
    for (let offset = 0; offset < userIds.length; offset += 50) {
      await Promise.all(
        userIds
          .slice(offset, offset + 50)
          .map((userId) => this.invalidateNotificationCache(userId, false)),
      );
    }

    // Fix: Pass 3 arguments: userIds, event, data
    await this.gateway.sendToUsers(userIds, 'notification', notifications);

    if (data.sendEmail !== false) {
      for (let offset = 0; offset < notifications.length; offset += 25) {
        await Promise.allSettled(
          notifications
            .slice(offset, offset + 25)
            .map((notification) =>
              this.sendEmailNotification(notification.userId, notification),
            ),
        );
      }
    }

    this.logger.log(`Bulk notifications sent to ${userIds.length} users`);
    return notifications;
  }

  // ============================================
  // USER NOTIFICATIONS
  // ============================================

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { read?: boolean; type?: string },
  ) {
    const where: any = { userId };

    if (filters?.read !== undefined) {
      where.read = filters.read;
    }
    if (filters?.type) {
      where.type = filters.type;
    }

    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    await this.invalidateNotificationCache(userId);

    const count = await this.getUnreadCount(userId);
    // Fix: Pass 3 arguments: userId, event, data
    await this.gateway.sendToUser(userId, 'unread-count', { count });

    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    await this.invalidateNotificationCache(userId);

    // Fix: Pass 3 arguments: userId, event, data
    await this.gateway.sendToUser(userId, 'unread-count', { count: 0 });

    return {
      message: `${result.count} notifications marked as read`,
      count: result.count,
    };
  }

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================

  async getPreferences(userId: string) {
    const cacheKey = `notifications:preferences:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    let result: NotificationPreferenceDto[];
    if (preferences.length === 0) {
      result = [
        { type: 'SYSTEM', email: true, push: true, inApp: true },
        { type: 'FINANCIAL', email: true, push: true, inApp: true },
        { type: 'ACADEMIC', email: true, push: true, inApp: true },
        { type: 'EVENT', email: true, push: true, inApp: true },
        { type: 'REMINDER', email: true, push: true, inApp: true },
        { type: 'SECURITY', email: true, push: true, inApp: true },
      ];
    } else {
      result = preferences.map((p) => ({
        type: p.type,
        email: p.email,
        push: p.push,
        inApp: p.inApp,
      }));
    }

    await this.cacheService.set(cacheKey, result, 600);
    return result;
  }

  async updatePreferences(
    userId: string,
    preferences: Array<{
      type: string;
      email: boolean;
      push: boolean;
      inApp: boolean;
    }>,
  ) {
    const results = await this.prisma.$transaction(
      preferences.map((pref) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_type: {
              userId,
              type: pref.type as any,
            },
          },
          update: {
            email: pref.email,
            push: pref.push,
            inApp: pref.inApp,
          },
          create: {
            userId,
            type: pref.type as any,
            email: pref.email,
            push: pref.push,
            inApp: pref.inApp,
          },
        }),
      ),
    );

    await this.invalidateNotificationCache(userId);
    return results;
  }

  // ============================================
  // EMAIL NOTIFICATIONS
  // ============================================

  private async sendEmailNotification(userId: string, notification: any) {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId,
          type: notification.type,
        },
      },
    });

    if (preferences && !preferences.email) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.email) return;

    const emailSubject = `${notification.title}`;
    const emailBody = this.getEmailTemplate(notification, user);

    await this.emailService.sendEmail(user.email, emailSubject, emailBody);
  }

  private getEmailTemplate(notification: any, user: any): string {
    const priority = String(notification.priority || 'NORMAL').toUpperCase();
    return renderHeighttEmail({
      preheader: String(notification.title || 'New Heightt notification'),
      category: 'Account notification',
      headline: String(notification.title || 'New notification'),
      recipientName:
        user.profile?.firstName || user.username || user.email || undefined,
      intro: String(notification.body || 'You have a new update from Heightt.'),
      actionLabel: notification.data?.link ? 'View details' : undefined,
      actionUrl: notification.data?.link || undefined,
      tone:
        priority === 'HIGH'
          ? 'warning'
          : priority === 'LOW'
            ? 'success'
            : 'info',
      reason:
        'You received this email because notifications are enabled for your Heightt account.',
    });
  }

  // ============================================
  // EVENT-DRIVEN NOTIFICATIONS
  // ============================================

  @OnEvent(SystemEvents.PAYMENT_RECEIVED)
  async handlePaymentReceived(data: any) {
    try {
      const userId = data.userId || data.payment?.payerId;
      const paymentId = data.paymentId || data.payment?.id;
      const organizationId = data.organizationId || data.organization?.id;
      const amount = data.amount ?? data.payment?.amount;

      if (!userId) {
        this.logger.warn(
          'PAYMENT_RECEIVED event missing userId, skipping notification',
        );
        return;
      }

      let orgName = data.organization?.name;
      if (!orgName && organizationId) {
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        });
        orgName = org?.name || 'Organization';
      }

      const formattedAmount = (Number(amount || 0) / 100).toFixed(2);

      await this.createNotification(userId, {
        title: 'Payment Received ✅',
        body: `Your payment of ₦${formattedAmount} to ${orgName || 'Organization'} was successful.`,
        type: 'FINANCIAL',
        priority: 'NORMAL',
        data: { paymentId, organizationId },
        sendEmail: true,
      });

      if (organizationId) {
        const admins = await this.prisma.organizationMembership.findMany({
          where: {
            organizationId,
            membershipType: 'ADMIN',
            status: 'ACTIVE',
          },
          select: { userId: true },
        });

        for (const admin of admins) {
          await this.createNotification(admin.userId, {
            title: 'New Payment Received 💰',
            body: `A payment of ₦${formattedAmount} was received from a member.`,
            type: 'FINANCIAL',
            priority: 'NORMAL',
            data: { paymentId, organizationId },
            sendEmail: false,
          });
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to handle PAYMENT_RECEIVED event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(SystemEvents.WITHDRAWAL_REQUESTED)
  async handleWithdrawalRequested(data: any) {
    const { withdrawal, organization } = data;

    await this.createBulkNotifications(data.adminUserIds, {
      title: 'Withdrawal Request Pending ⏳',
      body: `${organization.name} has requested a withdrawal of ₦${(Number(withdrawal.amount) / 100).toFixed(2)}.`,
      type: 'FINANCIAL',
      priority: 'HIGH',
      data: { withdrawalId: withdrawal.id, organizationId: organization.id },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_APPROVED)
  async handleWithdrawalApproved(data: any) {
    const { withdrawal, userId } = data;

    await this.createNotification(userId, {
      title: 'Withdrawal Approved ✅',
      body: `Your withdrawal of ₦${(Number(withdrawal.amount) / 100).toFixed(2)} has been approved and is being processed.`,
      type: 'FINANCIAL',
      priority: 'NORMAL',
      data: { withdrawalId: withdrawal.id },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_REJECTED)
  async handleWithdrawalRejected(data: any) {
    const { withdrawal, userId, reason } = data;

    await this.createNotification(userId, {
      title: 'Withdrawal Rejected ❌',
      body: `Your withdrawal of ₦${(Number(withdrawal.amount) / 100).toFixed(2)} was rejected. Reason: ${reason || 'Not specified'}`,
      type: 'FINANCIAL',
      priority: 'HIGH',
      data: { withdrawalId: withdrawal.id },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_COMPLETED)
  async handleWithdrawalCompleted(data: any) {
    await this.createNotification(data.userId, {
      title: 'Withdrawal Completed ✅',
      body: `Your withdrawal of ₦${(Number(data.amount) / 100).toFixed(2)} has been completed successfully.`,
      type: 'FINANCIAL',
      priority: 'NORMAL',
      data: { withdrawalId: data.withdrawalId, reference: data.reference },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_FAILED)
  async handleWithdrawalFailed(data: any) {
    await this.createNotification(data.userId, {
      title: 'Withdrawal Failed ❌',
      body: `Your withdrawal of ₦${(Number(data.amount) / 100).toFixed(2)} failed. Reason: ${data.reason || 'Not specified'}. The funds have been returned to your wallet.`,
      type: 'FINANCIAL',
      priority: 'HIGH',
      data: {
        withdrawalId: data.withdrawalId,
        reference: data.reference,
        reason: data.reason,
      },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.ANNOUNCEMENT_PUBLISHED)
  async handleAnnouncementPublished(data: any) {
    const { announcement, organization } = data;

    const members = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: organization.id,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    await this.createBulkNotifications(
      members.map((m) => m.userId),
      {
        title: `📢 ${announcement.title}`,
        body:
          announcement.content.length > 150
            ? `${announcement.content.substring(0, 150)}...`
            : announcement.content,
        type: 'SYSTEM',
        priority: announcement.priority || 'NORMAL',
        data: {
          announcementId: announcement.id,
          organizationId: organization.id,
          link: `${process.env.FRONTEND_URL}/announcements/${announcement.id}`,
        },
        sendEmail:
          announcement.priority === 'URGENT' ||
          announcement.priority === 'HIGH',
      },
    );
  }

  @OnEvent(SystemEvents.ORGANIZATION_MEMBER_ADDED)
  async handleMemberAdded(data: any) {
    const { user, organization, addedBy } = data;

    await this.createNotification(user.id, {
      title: 'Welcome to the Team! 🎉',
      body: `You have been added to ${organization.name} by ${addedBy.username}.`,
      type: 'SYSTEM',
      priority: 'NORMAL',
      data: { organizationId: organization.id },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.STUDENT_PROMOTED)
  async handleStudentPromoted(data: any) {
    const { student, fromLevel, toLevel } = data;

    await this.createNotification(student.userId, {
      title: 'Congratulations! 🎓',
      body: `You have been promoted from ${fromLevel.name} to ${toLevel.name}.`,
      type: 'ACADEMIC',
      priority: 'NORMAL',
      data: {
        studentId: student.id,
        fromLevelId: fromLevel.id,
        toLevelId: toLevel.id,
      },
      sendEmail: true,
    });
  }

  @OnEvent(SystemEvents.SAVINGS_GOAL_COMPLETED)
  async handleSavingsGoalCompleted(data: any) {
    const { goal, user } = data;

    await this.createNotification(user.id, {
      title: '🎯 Savings Goal Achieved!',
      body: `Congratulations! You have achieved your savings goal: ${goal.title} (₦${(Number(goal.targetAmount) / 100).toFixed(2)}).`,
      type: 'FINANCIAL',
      priority: 'NORMAL',
      data: { goalId: goal.id },
      sendEmail: true,
    });
  }
}
