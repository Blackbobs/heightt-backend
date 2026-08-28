// src/gateways/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../redis/cache.service';
import { OnEvent } from '@nestjs/event-emitter';
import { SystemEvents } from '../events/event.types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
    cors: {
    origin: (origin: string, callback: (err: Error | null, allow: boolean) => void) => {
      const rawOrigins =
        process.env.CORS_ORIGIN ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000,http://localhost:3001';
      const allowedOrigins = rawOrigins
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private connectedClients: Map<string, string[]> = new Map();
  private userOrganizations: Map<string, string[]> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn('Client connected without token');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, username: true },
      });

      if (!user) {
        this.logger.warn('Client connected with invalid user');
        client.disconnect();
        return;
      }

      client.userId = user.id;

      // Store client connection
      if (!this.connectedClients.has(user.id)) {
        this.connectedClients.set(user.id, []);
      }
      const userSockets = this.connectedClients.get(user.id);
      if (userSockets) {
        userSockets.push(client.id);
      }

      // Load user's organizations for room joining
      await this.loadUserOrganizations(user.id);
      const orgs = this.userOrganizations.get(user.id) || [];
      for (const orgId of orgs) {
        client.join(`organization:${orgId}`);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${user.id})`);

      // Send connection confirmation
      client.emit('connected', {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      await this.sendPendingNotifications(user.id, client);
      await this.sendUnreadCount(user.id);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedClients.get(client.userId);
      if (userSockets) {
        const index = userSockets.indexOf(client.id);
        if (index > -1) {
          userSockets.splice(index, 1);
        }
        if (userSockets.length === 0) {
          this.connectedClients.delete(client.userId);
        }
      }
      this.logger.log(
        `Client disconnected: ${client.id} (User: ${client.userId})`,
      );
    }
  }

  // ============================================
  // SUBSCRIBE MESSAGES
  // ============================================

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    if (!client.userId) return;

    const { room } = data;
    if (room) {
      client.join(room);
      this.logger.log(`User ${client.userId} subscribed to room: ${room}`);
      return { success: true, room };
    }
    return { success: false, message: 'No room specified' };
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    if (!client.userId) return;

    const { room } = data;
    if (room) {
      client.leave(room);
      this.logger.log(`User ${client.userId} unsubscribed from room: ${room}`);
      return { success: true, room };
    }
    return { success: false, message: 'No room specified' };
  }

  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notificationId: string },
  ) {
    if (!client.userId) return;

    await this.prisma.notification.update({
      where: {
        id: data.notificationId,
        userId: client.userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    await this.sendUnreadCount(client.userId);
  }

  @SubscribeMessage('mark-all-read')
  async handleMarkAllRead(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) return;

    await this.prisma.notification.updateMany({
      where: {
        userId: client.userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    await this.sendUnreadCount(client.userId);
  }

  @SubscribeMessage('get-notifications')
  async handleGetNotifications(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { page?: number; limit?: number },
  ) {
    if (!client.userId) return;

    const page = data?.page || 1;
    const limit = data?.limit || 20;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: client.userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { userId: client.userId },
      }),
    ]);

    client.emit('notifications', {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  @SubscribeMessage('get-wallet')
  async handleGetWallet(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) return;

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: client.userId },
      include: { ledgerAccount: true },
    });

    if (wallet) {
      client.emit('wallet-update', {
        balance: wallet.balance,
        heldBalance: wallet.heldBalance,
        currency: wallet.currency,
        status: wallet.status,
        ledgerAccountId: wallet.ledgerAccountId,
      });
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return { pong: Date.now() };
  }

  // ============================================
  // SEND METHODS
  // ============================================

  async sendToUser(userId: string, event: string, data: any) {
    const userSockets = this.connectedClients.get(userId);
    if (userSockets && userSockets.length > 0) {
      const payload = {
        event,
        data,
        timestamp: new Date().toISOString(),
      };
      for (const socketId of userSockets) {
        this.server.to(socketId).emit('notification', payload);
      }
      this.logger.debug(`Sent ${event} to user ${userId}`);
    }
  }

  async sendToUsers(userIds: string[], event: string, data: any) {
    for (const userId of userIds) {
      await this.sendToUser(userId, event, data);
    }
  }
  async sendToOrganization(organizationId: string, event: string, data: any) {
    const payload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    this.server
      .to(`organization:${organizationId}`)
      .emit('notification', payload);
    this.logger.debug(`Sent ${event} to organization ${organizationId}`);
  }

  async sendToAdmins(event: string, data: any) {
    const admins = await this.prisma.admin.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
    });

    const userIds = admins.map((a) => a.userId);
    await this.sendToUsers(userIds, event, data);
  }

  async sendToPlatformAdmins(event: string, data: any) {
    const admins = await this.prisma.admin.findMany({
      where: {
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
      select: { userId: true },
    });

    const userIds = admins.map((a) => a.userId);
    await this.sendToUsers(userIds, event, data);
  }

  // ============================================
  // NOTIFICATION METHODS
  // ============================================

  async sendNotification(userId: string, notification: any) {
    // Save to database
    const saved = await this.prisma.notification.create({
      data: {
        userId,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        priority: notification.priority || 'NORMAL',
        data: notification.data || {},
        deliveredAt: new Date(),
      },
    });

    // Send real-time
    await this.sendToUser(userId, 'notification', saved);

    // Update unread count
    await this.sendUnreadCount(userId);

    return saved;
  }

  private async sendPendingNotifications(userId: string, client: Socket) {
    const unreadNotifications = await this.prisma.notification.findMany({
      where: {
        userId,
        read: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (unreadNotifications.length > 0) {
      client.emit('pending-notifications', unreadNotifications);
    }
  }

  private async sendUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    const userSockets = this.connectedClients.get(userId);
    if (userSockets) {
      for (const socketId of userSockets) {
        this.server.to(socketId).emit('unread-count', { count });
      }
    }
  }

  private async loadUserOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      select: { organizationId: true },
    });

    const orgIds = memberships.map((m) => m.organizationId);
    this.userOrganizations.set(userId, orgIds);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  @OnEvent(SystemEvents.PAYMENT_RECEIVED)
  async handlePaymentReceived(data: any) {
    this.logger.log(`Payment received: ${data.paymentId}`);

    // Notify user
    await this.sendToUser(data.userId, 'payment-received', {
      paymentId: data.paymentId,
      amount: data.amount,
      reference: data.reference,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
    });

    // Notify organization admins
    if (data.organizationId) {
      await this.sendToOrganization(data.organizationId, 'payment-received', {
        paymentId: data.paymentId,
        userId: data.userId,
        amount: data.amount,
        reference: data.reference,
        timestamp: new Date().toISOString(),
      });
    }

    // Update wallet balance
    if (data.userId) {
      await this.sendWalletBalance(data.userId);
    }
  }

  @OnEvent(SystemEvents.PAYMENT_FAILED)
  async handlePaymentFailed(data: any) {
    this.logger.log(`Payment failed: ${data.paymentId}`);

    await this.sendToUser(data.userId, 'payment-failed', {
      paymentId: data.paymentId,
      amount: data.amount,
      reason: data.reason,
      reference: data.reference,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.WALLET_CREDITED)
  async handleWalletCredited(data: any) {
    this.logger.log(`Wallet credited: ${data.walletId}`);

    await this.sendToUser(data.userId, 'wallet-credited', {
      walletId: data.walletId,
      amount: data.amount,
      balance: data.balance,
      previousBalance: data.previousBalance,
      reference: data.reference,
      description: data.description,
      timestamp: new Date().toISOString(),
    });

    await this.sendWalletBalance(data.userId);
  }

  @OnEvent(SystemEvents.WALLET_DEBITED)
  async handleWalletDebited(data: any) {
    this.logger.log(`Wallet debited: ${data.walletId}`);

    await this.sendToUser(data.userId, 'wallet-debited', {
      walletId: data.walletId,
      amount: data.amount,
      balance: data.balance,
      previousBalance: data.previousBalance,
      reference: data.reference,
      description: data.description,
      timestamp: new Date().toISOString(),
    });

    await this.sendWalletBalance(data.userId);
  }

  @OnEvent(SystemEvents.WITHDRAWAL_REQUESTED)
  async handleWithdrawalRequested(data: any) {
    this.logger.log(`Withdrawal requested: ${data.withdrawalId}`);

    await this.sendToUser(data.userId, 'withdrawal-requested', {
      withdrawalId: data.withdrawalId,
      amount: data.amount,
      reference: data.reference,
      status: 'PENDING',
      bankName: data.bankName,
      timestamp: new Date().toISOString(),
    });

    // Notify platform admins
    await this.sendToPlatformAdmins('withdrawal-requested', {
      withdrawalId: data.withdrawalId,
      organizationId: data.organizationId,
      amount: data.amount,
      reference: data.reference,
      requesterId: data.userId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_APPROVED)
  async handleWithdrawalApproved(data: any) {
    this.logger.log(`Withdrawal approved: ${data.withdrawalId}`);

    await this.sendToUser(data.userId, 'withdrawal-approved', {
      withdrawalId: data.withdrawalId,
      amount: data.amount,
      reference: data.reference,
      processedAt: data.processedAt,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_REJECTED)
  async handleWithdrawalRejected(data: any) {
    this.logger.log(`Withdrawal rejected: ${data.withdrawalId}`);

    await this.sendToUser(data.userId, 'withdrawal-rejected', {
      withdrawalId: data.withdrawalId,
      amount: data.amount,
      reference: data.reference,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_COMPLETED)
  async handleWithdrawalCompleted(data: any) {
    this.logger.log(`Withdrawal completed: ${data.withdrawalId}`);

    await this.sendToUser(data.userId, 'withdrawal-completed', {
      withdrawalId: data.withdrawalId,
      amount: data.amount,
      reference: data.reference,
      completedAt: data.completedAt,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.WITHDRAWAL_FAILED)
  async handleWithdrawalFailed(data: any) {
    this.logger.log(`Withdrawal failed: ${data.withdrawalId}`);

    await this.sendToUser(data.userId, 'withdrawal-failed', {
      withdrawalId: data.withdrawalId,
      amount: data.amount,
      reference: data.reference,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.DUES_DUE_SOON)
  async handleDuesDueSoon(data: any) {
    this.logger.log(`Dues due soon: ${data.studentId}`);

    await this.sendToUser(data.userId, 'dues-due-soon', {
      dueId: data.dueId,
      amount: data.amount,
      dueDate: data.dueDate,
      organizationId: data.organizationId,
      daysUntilDue: data.daysUntilDue,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.DUES_OVERDUE)
  async handleDuesOverdue(data: any) {
    this.logger.log(`Dues overdue: ${data.studentId}`);

    await this.sendToUser(data.userId, 'dues-overdue', {
      dueId: data.dueId,
      amount: data.amount,
      dueDate: data.dueDate,
      organizationId: data.organizationId,
      daysOverdue: data.daysOverdue,
      timestamp: new Date().toISOString(),
    });

    // Notify organization admins
    if (data.organizationId) {
      await this.sendToOrganization(data.organizationId, 'dues-overdue', {
        studentId: data.studentId,
        dueId: data.dueId,
        amount: data.amount,
        daysOverdue: data.daysOverdue,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @OnEvent(SystemEvents.SAVINGS_GOAL_COMPLETED)
  async handleSavingsGoalCompleted(data: any) {
    this.logger.log(`Savings goal completed: ${data.goalId}`);

    await this.sendToUser(data.userId, 'savings-goal-completed', {
      goalId: data.goalId,
      title: data.title,
      targetAmount: data.targetAmount,
      currentAmount: data.currentAmount,
      completedAt: data.completedAt,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.STUDENT_PROMOTED)
  async handleStudentPromoted(data: any) {
    this.logger.log(`Student promoted: ${data.studentId}`);

    await this.sendToUser(data.userId, 'student-promoted', {
      studentId: data.studentId,
      fromLevelId: data.fromLevelId,
      toLevelId: data.toLevelId,
      promotionDate: data.promotionDate,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(SystemEvents.ANNOUNCEMENT_PUBLISHED)
  async handleAnnouncementPublished(data: any) {
    this.logger.log(`Announcement published: ${data.announcementId}`);

    if (data.organizationId) {
      await this.sendToOrganization(
        data.organizationId,
        'announcement-published',
        {
          announcementId: data.announcementId,
          title: data.title,
          content: data.content,
          priority: data.priority,
          publishedAt: data.publishedAt,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  // ============================================
  // WALLET BALANCE HELPER
  // ============================================

  private async sendWalletBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { ledgerAccount: true },
    });

    if (wallet) {
      await this.sendToUser(userId, 'wallet-balance', {
        balance: wallet.balance,
        heldBalance: wallet.heldBalance,
        currency: wallet.currency,
        status: wallet.status,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
