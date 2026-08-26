// src/v1/communication/communication.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AnnouncementService } from './announcement.service';
import { NotificationService } from './notification.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('communication')
@Controller('communication')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class CommunicationController {
  private readonly logger = new Logger(CommunicationController.name);

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly notificationService: NotificationService,
  ) {}

  // ============================================
  // ANNOUNCEMENT ENDPOINTS
  // ============================================

  @Post('announcements')
  @UseGuards(AdminGuard)
  @RequirePermission('communication:create')
  @InvalidateCache(['announcements', 'communication'])
  @ApiOperation({ summary: 'Create announcement' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        type: {
          enum: [
            'GENERAL',
            'IMPORTANT',
            'URGENT',
            'FINANCIAL',
            'ACADEMIC',
            'EVENT',
          ],
        },
        priority: { enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        expiresAt: { type: 'string', format: 'date-time' },
      },
      required: ['organizationId', 'title', 'content'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Announcement created',
  })
  async createAnnouncement(@Request() req: any, @Body() body: any) {
    this.logger.log('Create announcement endpoint called');
    return this.announcementService.createAnnouncement(req.user.id, body);
  }

  @Get('announcements')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { organizationId, page, limit, isPublished, type, priority } =
        request.query;
      return `announcements:v2:${organizationId || 'all'}:${page || 1}:${limit || 10}:${isPublished || 'all'}:${type || 'all'}:${priority || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['announcements', 'communication'],
  })
  @ApiOperation({ summary: 'Get announcements' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'isPublished', required: false, enum: ['true', 'false'] })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['GENERAL', 'IMPORTANT', 'URGENT', 'FINANCIAL', 'ACADEMIC', 'EVENT'],
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcements retrieved',
  })
  async getAnnouncements(
    @Query('organizationId') organizationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('isPublished') isPublished?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
  ) {
    this.logger.log('Get announcements endpoint called');
    return this.announcementService.getAnnouncements(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
      {
        isPublished:
          isPublished === 'true'
            ? true
            : isPublished === 'false'
              ? false
              : undefined,
        type,
        priority,
      },
    );
  }

  @Get('announcements/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `announcement:${request.params.id}`;
    },
    ttl: 600, // 10 minutes
    tags: ['announcements', 'communication'],
  })
  @ApiOperation({ summary: 'Get announcement by ID' })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcement retrieved',
  })
  async getAnnouncementById(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Get announcement by ID endpoint called: ${id}`);
    return this.announcementService.getAnnouncementById(id, req.user?.id);
  }

  @Patch('announcements/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('communication:create')
  @InvalidateCache(['announcements', 'communication'])
  @ApiOperation({ summary: 'Update announcement' })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        type: {
          enum: [
            'GENERAL',
            'IMPORTANT',
            'URGENT',
            'FINANCIAL',
            'ACADEMIC',
            'EVENT',
          ],
        },
        priority: { enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcement updated',
  })
  async updateAnnouncement(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    this.logger.log(`Update announcement endpoint called: ${id}`);
    return this.announcementService.updateAnnouncement(id, req.user.id, body);
  }

  @Post('announcements/:id/publish')
  @UseGuards(AdminGuard)
  @RequirePermission('communication:manage')
  @InvalidateCache(['announcements', 'communication'])
  @ApiOperation({ summary: 'Publish announcement' })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcement published',
  })
  async publishAnnouncement(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Publish announcement endpoint called: ${id}`);
    return this.announcementService.publishAnnouncement(id, req.user.id);
  }

  @Post('announcements/:id/read')
  @InvalidateCache(['announcements', 'communication'])
  @ApiOperation({ summary: 'Mark announcement as read' })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcement marked as read',
  })
  async markAnnouncementRead(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Mark announcement read endpoint called: ${id}`);
    return this.announcementService.markAsRead(id, req.user.id);
  }

  @Delete('announcements/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('communication:delete')
  @InvalidateCache(['announcements', 'communication'])
  @ApiOperation({ summary: 'Delete announcement' })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Announcement deleted',
  })
  async deleteAnnouncement(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete announcement endpoint called: ${id}`);
    return this.announcementService.deleteAnnouncement(id, req.user.id);
  }

  // ============================================
  // NOTIFICATION ENDPOINTS
  // ============================================

  @Get('notifications')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const userId = request.user.id;
      const { page, limit, read, type } = request.query;
      return `notifications:user:${userId}:${page || 1}:${limit || 20}:${read || 'all'}:${type || 'all'}`;
    },
    ttl: 60, // 1 minute - notifications change frequently
    tags: ['notifications', 'communication'],
  })
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'read', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'type', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notifications retrieved',
  })
  async getNotifications(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('read') read?: string,
    @Query('type') type?: string,
  ) {
    this.logger.log('Get notifications endpoint called');
    return this.notificationService.getUserNotifications(
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
      {
        read: read === 'true' ? true : read === 'false' ? false : undefined,
        type,
      },
    );
  }

  @Get('notifications/unread-count')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `notifications:unread:${request.user.id}`;
    },
    ttl: 30, // 30 seconds - unread count changes frequently
    tags: ['notifications', 'communication'],
  })
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unread count retrieved',
  })
  async getUnreadCount(@Request() req: any) {
    this.logger.log('Get unread count endpoint called');
    return {
      count: await this.notificationService.getUnreadCount(req.user.id),
    };
  }

  @Patch('notifications/:id/read')
  @InvalidateCache(['notifications', 'communication'])
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification marked as read',
  })
  async markNotificationRead(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Mark notification read endpoint called: ${id}`);
    return this.notificationService.markAsRead(req.user.id, id);
  }

  @Patch('notifications/read-all')
  @InvalidateCache(['notifications', 'communication'])
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read',
  })
  async markAllNotificationsRead(@Request() req: any) {
    this.logger.log('Mark all notifications read endpoint called');
    return this.notificationService.markAllAsRead(req.user.id);
  }

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================

  @Get('notifications/preferences')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `notifications:preferences:${request.user.id}`;
    },
    ttl: 600, // 10 minutes - preferences change rarely
    tags: ['notifications', 'communication', 'preferences'],
  })
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preferences retrieved',
  })
  async getPreferences(@Request() req: any) {
    this.logger.log('Get preferences endpoint called');
    return this.notificationService.getPreferences(req.user.id);
  }

  @Patch('notifications/preferences')
  @InvalidateCache(['notifications', 'communication', 'preferences'])
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            enum: [
              'SYSTEM',
              'FINANCIAL',
              'ACADEMIC',
              'EVENT',
              'REMINDER',
              'SECURITY',
            ],
          },
          email: { type: 'boolean' },
          push: { type: 'boolean' },
          inApp: { type: 'boolean' },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preferences updated',
  })
  async updatePreferences(@Request() req: any, @Body() body: any[]) {
    this.logger.log('Update preferences endpoint called');
    return this.notificationService.updatePreferences(req.user.id, body);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('communication:manage')
  @InvalidateCache([
    'announcements',
    'notifications',
    'communication',
    'preferences',
  ])
  @ApiOperation({
    summary: 'Invalidate communication cache (Admin only)',
    description: 'Clear all communication-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for invalidating cache',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communication cache invalidated',
  })
  async invalidateCommunicationCache(
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate communication cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    // Also invalidate via service methods
    await this.announcementService.invalidateAnnouncementCache();
    await this.notificationService.invalidateNotificationCache(req.user.id);

    return {
      message: 'Communication cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      tagsInvalidated: [
        'announcements',
        'notifications',
        'communication',
        'preferences',
      ],
    };
  }
}
