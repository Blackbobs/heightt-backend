import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { EventService, SystemEvents } from '../events/event.service';
import { EmailService } from '../email/email.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    private readonly eventService: EventService,
    private readonly emailService: EmailService,
  ) {}

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

    // Send real-time notification via WebSocket
    await this.gateway.sendToUser(userId, notification);

    // Send email if enabled
    if (data.sendEmail !== false) {
      await this.sendEmailNotification(userId, notification);
    }

    // Emit event
    this.eventService.emit(SystemEvents.NOTIFICATION_SENT, {
      userId,
      notification,
    });

    this.logger.log(`Notification sent to user ${userId}: ${data.title}`);
    return notification;
  }

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
    const notifications = await this.prisma.$transaction(
      userIds.map((userId) =>
        this.prisma.notification.create({
          data: {
            userId,
            title: data.title,
            body: data.body,
            type: data.type as any,
            priority: (data.priority as any) || 'NORMAL',
            data: data.data || {},
            deliveredAt: new Date(),
          },
        }),
      ),
    );

    // Send real-time notifications via WebSocket
    await this.gateway.sendToUsers(userIds, notifications);

    // Send emails if enabled
    if (data.sendEmail !== false) {
      for (const notification of notifications) {
        await this.sendEmailNotification(notification.userId, notification);
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

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
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
      throw new Error('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    // Update unread count via WebSocket
    const count = await this.getUnreadCount(userId);
    await this.gateway.sendToUser(userId, { type: 'unread-count', count });

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

    // Update unread count via WebSocket
    await this.gateway.sendToUser(userId, { type: 'unread-count', count: 0 });

    return {
      message: `${result.count} notifications marked as read`,
      count: result.count,
    };
  }

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================

  async getPreferences(userId: string) {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    // Return default preferences if none exist
    if (preferences.length === 0) {
      return [
        { type: 'SYSTEM', email: true, push: true, inApp: true },
        { type: 'FINANCIAL', email: true, push: true, inApp: true },
        { type: 'ACADEMIC', email: true, push: true, inApp: true },
        { type: 'EVENT', email: true, push: true, inApp: true },
        { type: 'REMINDER', email: true, push: true, inApp: true },
        { type: 'SECURITY', email: true, push: true, inApp: true },
      ];
    }

    return preferences;
  }

  // In the updatePreferences method, fix the results array type
  async updatePreferences(
    userId: string,
    preferences: Array<{
      type: string;
      email: boolean;
      push: boolean;
      inApp: boolean;
    }>,
  ) {
    const results: any[] = [];
    for (const pref of preferences) {
      const updated = await this.prisma.notificationPreference.upsert({
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
      });
      results.push(updated);
    }

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

    // Skip if email notifications are disabled for this type
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
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
          .container { background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #4F46E5; margin: 0; }
          .content { color: #333; line-height: 1.6; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .priority-high { border-left: 4px solid #EF4444; padding-left: 15px; }
          .priority-normal { border-left: 4px solid #4F46E5; padding-left: 15px; }
          .priority-low { border-left: 4px solid #10B981; padding-left: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Heightt</h1>
            <p style="color: #6B7280;">Financial Management for Students</p>
          </div>
          <div class="content">
            <h2>${notification.title}</h2>
            <div class="priority-${notification.priority.toLowerCase()}">
              <p>${notification.body}</p>
            </div>
            ${notification.data?.link ? `<a href="${notification.data.link}" class="button">View Details</a>` : ''}
            <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
              This notification was sent to you because you are a member of Heightt.
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Heightt. All rights reserved.</p>
            <p>
              <a href="${process.env.FRONTEND_URL}/settings/notifications" style="color: #4F46E5;">Manage Preferences</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // ============================================
  // EVENT-DRIVEN NOTIFICATIONS
  // ============================================

  @OnEvent(SystemEvents.PAYMENT_RECEIVED)
  async handlePaymentReceived(data: any) {
    const { userId, payment, organization } = data;

    await this.createNotification(userId, {
      title: 'Payment Received ✅',
      body: `Your payment of ₦${(Number(payment.amount) / 100).toFixed(2)} to ${organization.name} was successful.`,
      type: 'FINANCIAL',
      priority: 'NORMAL',
      data: { paymentId: payment.id, organizationId: organization.id },
      sendEmail: true,
    });

    // Notify organization admins
    const admins = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: organization.id,
        membershipType: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    for (const admin of admins) {
      await this.createNotification(admin.userId, {
        title: 'New Payment Received 💰',
        body: `A payment of ₦${(Number(payment.amount) / 100).toFixed(2)} was received from a member.`,
        type: 'FINANCIAL',
        priority: 'NORMAL',
        data: { paymentId: payment.id, organizationId: organization.id },
        sendEmail: false,
      });
    }
  }

  @OnEvent(SystemEvents.WITHDRAWAL_REQUESTED)
  async handleWithdrawalRequested(data: any) {
    const { withdrawal, organization } = data;

    // Notify platform admins
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

  @OnEvent(SystemEvents.DUES_DUE_SOON)
  async handleDuesDueSoon(data: any) {
    const { studentId, due, organization } = data;

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (student) {
      await this.createNotification(student.userId, {
        title: 'Dues Due Soon ⏰',
        body: `Your ${due.name} of ₦${(Number(due.amount) / 100).toFixed(2)} is due on ${new Date(due.dueDate).toLocaleDateString()}.`,
        type: 'FINANCIAL',
        priority: 'NORMAL',
        data: { dueId: due.id, organizationId: organization.id },
        sendEmail: true,
      });
    }
  }

  @OnEvent(SystemEvents.DUES_OVERDUE)
  async handleDuesOverdue(data: any) {
    const { studentId, due, organization } = data;

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (student) {
      await this.createNotification(student.userId, {
        title: 'Dues Overdue ⚠️',
        body: `Your ${due.name} of ₦${(Number(due.amount) / 100).toFixed(2)} is overdue. Please pay as soon as possible.`,
        type: 'FINANCIAL',
        priority: 'HIGH',
        data: { dueId: due.id, organizationId: organization.id },
        sendEmail: true,
      });
    }
  }

  @OnEvent(SystemEvents.ANNOUNCEMENT_PUBLISHED)
  async handleAnnouncementPublished(data: any) {
    const { announcement, organization } = data;

    // Notify all members of the organization
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
