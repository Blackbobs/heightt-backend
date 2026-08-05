// src/v1/dashboard/dashboard.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  @Get('student')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `dashboard:student:${request.user.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['dashboard', 'student'],
  })
  @ApiOperation({ summary: 'Get student dashboard' })
  @ApiResponse({ status: 200, description: 'Student dashboard retrieved' })
  async getStudentDashboard(@Request() req: any) {
    this.logger.log('Get student dashboard endpoint called');
    return this.dashboardService.getStudentDashboard(req.user.id);
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @RequirePermission('dashboard:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `dashboard:admin:${request.user.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['dashboard', 'admin'],
  })
  @ApiOperation({ summary: 'Get admin dashboard' })
  @ApiResponse({ status: 200, description: 'Admin dashboard retrieved' })
  async getAdminDashboard(@Request() req: any) {
    this.logger.log('Get admin dashboard endpoint called');
    return this.dashboardService.getAdminDashboard(req.user.id);
  }

  @Get('platform-admin')
  @UseGuards(AdminGuard)
  @RequirePermission('dashboard:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `dashboard:platform:${request.user.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['dashboard', 'platform'],
  })
  @ApiOperation({ summary: 'Get platform admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Platform admin dashboard retrieved',
  })
  async getPlatformAdminDashboard(@Request() req: any) {
    this.logger.log('Get platform admin dashboard endpoint called');
    return this.dashboardService.getPlatformAdminDashboard(req.user.id);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('dashboard:manage')
  @InvalidateCache(['dashboard', 'student', 'admin', 'platform'])
  @ApiOperation({
    summary: 'Invalidate dashboard cache (Admin only)',
    description: 'Clear all dashboard-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Specific user to invalidate (optional)',
        },
        dashboardType: {
          type: 'string',
          enum: ['student', 'admin', 'platform'],
          description: 'Specific dashboard type to invalidate (optional)',
        },
        reason: {
          type: 'string',
          description: 'Reason for invalidating cache',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dashboard cache invalidated',
  })
  async invalidateDashboardCache(
    @Body() body: { userId?: string; dashboardType?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate dashboard cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.dashboardService.invalidateDashboardCache(
      body.userId,
      body.dashboardType,
    );

    return {
      message: 'Dashboard cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      userId: body.userId || 'all users',
      dashboardType: body.dashboardType || 'all',
    };
  }
}
