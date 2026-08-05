import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
  Request,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics.dto';
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId, organizationId, startDate, endDate, period } =
        request.query;
      return `analytics:dashboard:${institutionId || 'all'}:${organizationId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${period || 'monthly'}`;
    },
    ttl: 300,
    tags: ['analytics', 'dashboard'],
  })
  @ApiOperation({ summary: 'Get dashboard analytics' })
  @ApiResponse({ status: 200, description: 'Dashboard analytics' })
  async getDashboardAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get dashboard analytics endpoint called');
    return this.analyticsService.getDashboardAnalytics(dto);
  }

  @Get('revenue')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId, organizationId, startDate, endDate, period } =
        request.query;
      return `analytics:revenue:${institutionId || 'all'}:${organizationId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${period || 'monthly'}`;
    },
    ttl: 1800,
    tags: ['analytics', 'revenue'],
  })
  @ApiOperation({ summary: 'Get revenue analytics' })
  @ApiResponse({ status: 200, description: 'Revenue analytics' })
  async getRevenueAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get revenue analytics endpoint called');
    return this.analyticsService.getRevenueAnalytics(dto);
  }

  @Get('students')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:students:${institutionId || 'all'}`;
    },
    ttl: 3600,
    tags: ['analytics', 'students'],
  })
  @ApiOperation({ summary: 'Get student analytics' })
  @ApiResponse({ status: 200, description: 'Student analytics' })
  async getStudentAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get student analytics endpoint called');
    return this.analyticsService.getStudentAnalytics(dto);
  }

  @Get('organizations')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:organizations:${institutionId || 'all'}`;
    },
    ttl: 3600,
    tags: ['analytics', 'organizations'],
  })
  @ApiOperation({ summary: 'Get organization analytics' })
  @ApiResponse({ status: 200, description: 'Organization analytics' })
  async getOrganizationAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get organization analytics endpoint called');
    return this.analyticsService.getOrganizationAnalytics(dto);
  }

  @Get('collections')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:collections:${institutionId || 'all'}`;
    },
    ttl: 1800,
    tags: ['analytics', 'collections'],
  })
  @ApiOperation({ summary: 'Get collection analytics' })
  @ApiResponse({ status: 200, description: 'Collection analytics' })
  async getCollectionAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get collection analytics endpoint called');
    return this.analyticsService.getCollectionAnalytics(dto);
  }

  @Get('growth')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:growth:${institutionId || 'all'}`;
    },
    ttl: 7200,
    tags: ['analytics', 'growth'],
  })
  @ApiOperation({ summary: 'Get growth analytics' })
  @ApiResponse({ status: 200, description: 'Growth analytics' })
  async getGrowthAnalytics(@Query() dto: AnalyticsQueryDto) {
    this.logger.log('Get growth analytics endpoint called');
    return this.analyticsService.getGrowthAnalytics(dto);
  }

  @Post('cache/invalidate')
  @RequirePermission('analytics:manage')
  @InvalidateCache([
    'analytics',
    'revenue',
    'students',
    'organizations',
    'collections',
    'growth',
    'dashboard',
  ])
  @ApiOperation({
    summary: 'Invalidate analytics cache (Admin only)',
    description: 'Clear all analytics-related cache.',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics cache invalidated',
  })
  async invalidateAnalyticsCache() {
    this.logger.log('Invalidate analytics cache endpoint called');
    await this.analyticsService.invalidateAnalyticsCache();
    return {
      message: 'Analytics cache invalidated successfully',
      invalidatedAt: new Date().toISOString(),
    };
  }
}
