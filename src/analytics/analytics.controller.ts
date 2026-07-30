import {
  Controller,
  Get,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../common/guards/admin.guard';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  @RequirePermission('analytics:read')
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
    return this.analyticsService.getRevenueAnalytics(
      institutionId,
      startDate,
      endDate,
    );
  }

  @Get('students')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Get student analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Student analytics' })
  async getStudentAnalytics(@Query('institutionId') institutionId?: string) {
    return this.analyticsService.getStudentAnalytics(institutionId);
  }

  @Get('organizations')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Get organization analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Organization analytics' })
  async getOrganizationAnalytics(
    @Query('institutionId') institutionId?: string,
  ) {
    return this.analyticsService.getOrganizationAnalytics(institutionId);
  }

  @Get('collections')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Get collection analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Collection analytics' })
  async getCollectionAnalytics(@Query('institutionId') institutionId?: string) {
    return this.analyticsService.getCollectionAnalytics(institutionId);
  }

  @Get('growth')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Get growth analytics' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({ status: 200, description: 'Growth analytics' })
  async getGrowthAnalytics(@Query('institutionId') institutionId?: string) {
    return this.analyticsService.getGrowthAnalytics(institutionId);
  }
}
