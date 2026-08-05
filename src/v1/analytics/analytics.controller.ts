import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
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
// Import cache decorators
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

  @Get('revenue')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId, startDate, endDate } = request.query;
      // Generate cache key based on all query parameters
      return `analytics:revenue:${institutionId || 'all'}:${startDate || 'all'}:${endDate || 'all'}`;
    },
    ttl: 1800, // 30 minutes
    tags: ['analytics', 'revenue', 'financial'],
  })
  @ApiOperation({ summary: 'Get revenue analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiResponse({ status: 200, description: 'Revenue analytics' })
  async getRevenueAnalytics(
    @Query('institutionId') institutionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log('Get revenue analytics endpoint called');
    return this.analyticsService.getRevenueAnalytics(
      institutionId,
      startDate,
      endDate,
    );
  }

  @Get('students')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:students:${institutionId || 'all'}`;
    },
    ttl: 3600, // 1 hour
    tags: ['analytics', 'students', 'demographics'],
  })
  @ApiOperation({ summary: 'Get student analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Student analytics' })
  async getStudentAnalytics(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get student analytics endpoint called');
    return this.analyticsService.getStudentAnalytics(institutionId);
  }

  @Get('organizations')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:organizations:${institutionId || 'all'}`;
    },
    ttl: 3600, // 1 hour
    tags: ['analytics', 'organizations'],
  })
  @ApiOperation({ summary: 'Get organization analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Organization analytics' })
  async getOrganizationAnalytics(
    @Query('institutionId') institutionId?: string,
  ) {
    this.logger.log('Get organization analytics endpoint called');
    return this.analyticsService.getOrganizationAnalytics(institutionId);
  }

  @Get('collections')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:collections:${institutionId || 'all'}`;
    },
    ttl: 1800, // 30 minutes
    tags: ['analytics', 'collections', 'financial'],
  })
  @ApiOperation({ summary: 'Get collection analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Collection analytics' })
  async getCollectionAnalytics(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get collection analytics endpoint called');
    return this.analyticsService.getCollectionAnalytics(institutionId);
  }

  @Get('growth')
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { institutionId } = request.query;
      return `analytics:growth:${institutionId || 'all'}`;
    },
    ttl: 7200, // 2 hours
    tags: ['analytics', 'growth', 'trends'],
  })
  @ApiOperation({ summary: 'Get growth analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Growth analytics' })
  async getGrowthAnalytics(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get growth analytics endpoint called');
    return this.analyticsService.getGrowthAnalytics(institutionId);
  }
}
