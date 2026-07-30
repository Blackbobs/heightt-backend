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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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
        secret: process.env.JWT_ACCESS_SECRET,
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

      if (!this.connectedClients.has(user.id)) {
        this.connectedClients.set(user.id, []);
      }
      const userSockets = this.connectedClients.get(user.id);
      if (userSockets) {
        userSockets.push(client.id);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${user.id})`);

      await this.sendPendingNotifications(user.id, client);
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

  async sendToUser(userId: string, notification: any) {
    const userSockets = this.connectedClients.get(userId);
    if (userSockets && userSockets.length > 0) {
      for (const socketId of userSockets) {
        this.server.to(socketId).emit('notification', notification);
      }
    }
  }

  async sendToUsers(userIds: string[], notification: any) {
    for (const userId of userIds) {
      await this.sendToUser(userId, notification);
    }
  }

  async sendToOrganization(organizationId: string, notification: any) {
    const members = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);
    await this.sendToUsers(userIds, notification);
  }

  async sendToAdmins(notification: any) {
    const admins = await this.prisma.admin.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
    });

    const userIds = admins.map((a) => a.userId);
    await this.sendToUsers(userIds, notification);
  }

  async sendToPlatformAdmins(notification: any) {
    const admins = await this.prisma.admin.findMany({
      where: {
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
      select: { userId: true },
    });

    const userIds = admins.map((a) => a.userId);
    await this.sendToUsers(userIds, notification);
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

    await this.sendUnreadCount(userId);
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
}
