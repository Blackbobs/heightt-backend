// src/v1/platform/platform.controller.ts
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
import { PlatformService } from './platform.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../../common/guards/admin.guard';
import {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
  CreateMaintenanceDto,
  CreateKillSwitchDto,
  UpdatePlatformSettingDto,
} from './dto/feature-flag.dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('platform')
@Controller('platform')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class PlatformController {
  private readonly logger = new Logger(PlatformController.name);

  constructor(private readonly platformService: PlatformService) {}

  // ============================================
  // FEATURE FLAGS
  // ============================================

  @Post('features')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:feature_flag')
  @InvalidateCache(['platform', 'features'])
  @ApiOperation({ summary: 'Create feature flag (Platform Admin only)' })
  @ApiBody({ type: CreateFeatureFlagDto })
  async createFeatureFlag(
    @Request() req: any,
    @Body() dto: CreateFeatureFlagDto,
  ) {
    this.logger.log('Create feature flag endpoint called');
    return this.platformService.createFeatureFlag(req.user.id, dto);
  }

  @Get('features')
  @Cache({
    key: () => 'features:all',
    ttl: 300, // 5 minutes
    tags: ['platform', 'features'],
  })
  @ApiOperation({ summary: 'Get all feature flags' })
  async getFeatureFlags() {
    this.logger.log('Get feature flags endpoint called');
    return this.platformService.getFeatureFlags();
  }

  @Get('features/:key')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `feature:${request.params.key}`;
    },
    ttl: 300, // 5 minutes
    tags: ['platform', 'features'],
  })
  @ApiOperation({ summary: 'Get feature flag by key' })
  @ApiParam({ name: 'key', description: 'Feature key' })
  async getFeatureFlag(@Param('key') key: string) {
    this.logger.log(`Get feature flag endpoint called: ${key}`);
    return this.platformService.getFeatureFlag(key);
  }

  @Patch('features/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:feature_flag')
  @InvalidateCache(['platform', 'features'])
  @ApiOperation({ summary: 'Update feature flag (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Feature flag ID' })
  @ApiBody({ type: UpdateFeatureFlagDto })
  async updateFeatureFlag(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    this.logger.log(`Update feature flag endpoint called: ${id}`);
    return this.platformService.updateFeatureFlag(id, req.user.id, dto);
  }

  @Delete('features/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:feature_flag')
  @InvalidateCache(['platform', 'features'])
  @ApiOperation({ summary: 'Delete feature flag (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Feature flag ID' })
  async deleteFeatureFlag(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete feature flag endpoint called: ${id}`);
    return this.platformService.deleteFeatureFlag(id, req.user.id);
  }

  // ============================================
  // MAINTENANCE MODE
  // ============================================

  @Post('maintenance')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
  @InvalidateCache(['platform', 'maintenance'])
  @ApiOperation({ summary: 'Set maintenance mode (Platform Admin only)' })
  @ApiBody({ type: CreateMaintenanceDto })
  async setMaintenanceMode(
    @Request() req: any,
    @Body() dto: CreateMaintenanceDto,
  ) {
    this.logger.log('Set maintenance mode endpoint called');
    return this.platformService.setMaintenanceMode(req.user.id, dto);
  }

  @Get('maintenance')
  @Cache({
    key: () => 'maintenance:status',
    ttl: 60, // 1 minute
    tags: ['platform', 'maintenance'],
  })
  @ApiOperation({ summary: 'Get maintenance status' })
  async getMaintenanceStatus() {
    this.logger.log('Get maintenance status endpoint called');
    return this.platformService.getMaintenanceStatus();
  }

  // ============================================
  // KILL SWITCHES
  // ============================================

  @Post('kill-switches')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
  @InvalidateCache(['platform', 'kill-switches'])
  @ApiOperation({ summary: 'Create kill switch (Platform Admin only)' })
  @ApiBody({ type: CreateKillSwitchDto })
  async createKillSwitch(
    @Request() req: any,
    @Body() dto: CreateKillSwitchDto,
  ) {
    this.logger.log('Create kill switch endpoint called');
    return this.platformService.createKillSwitch(req.user.id, dto);
  }

  @Get('kill-switches')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @Cache({
    key: () => 'kill-switches:all',
    ttl: 60, // 1 minute
    tags: ['platform', 'kill-switches'],
  })
  @ApiOperation({ summary: 'Get kill switches (Platform Admin only)' })
  async getKillSwitches() {
    this.logger.log('Get kill switches endpoint called');
    return this.platformService.getKillSwitches();
  }

  @Post('kill-switches/:key/toggle')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
  @InvalidateCache(['platform', 'kill-switches'])
  @ApiOperation({ summary: 'Toggle kill switch (Platform Admin only)' })
  @ApiParam({ name: 'key', description: 'Kill switch key' })
  @ApiBody({
    schema: { type: 'object', properties: { enabled: { type: 'boolean' } } },
  })
  async toggleKillSwitch(
    @Param('key') key: string,
    @Request() req: any,
    @Body() body: { enabled: boolean },
  ) {
    this.logger.log(`Toggle kill switch endpoint called: ${key}`);
    return this.platformService.toggleKillSwitch(
      key,
      req.user.id,
      body.enabled,
    );
  }

  // ============================================
  // PLATFORM SETTINGS
  // ============================================

  @Get('settings')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `settings:${request.query.publicOnly || 'false'}`;
    },
    ttl: 600, // 10 minutes
    tags: ['platform', 'settings'],
  })
  @ApiOperation({ summary: 'Get platform settings' })
  @ApiQuery({ name: 'publicOnly', required: false, type: 'boolean' })
  async getPlatformSettings(@Query('publicOnly') publicOnly: string = 'false') {
    this.logger.log('Get platform settings endpoint called');
    return this.platformService.getPlatformSettings(publicOnly === 'true');
  }

  @Get('settings/:key')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `setting:${request.params.key}`;
    },
    ttl: 600, // 10 minutes
    tags: ['platform', 'settings'],
  })
  @ApiOperation({ summary: 'Get platform setting by key' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  async getPlatformSetting(@Param('key') key: string) {
    this.logger.log(`Get platform setting endpoint called: ${key}`);
    return this.platformService.getPlatformSetting(key);
  }

  @Patch('settings/:key')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:update')
  @InvalidateCache(['platform', 'settings'])
  @ApiOperation({ summary: 'Update platform setting (Platform Admin only)' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiBody({ type: UpdatePlatformSettingDto })
  async updatePlatformSetting(
    @Param('key') key: string,
    @Request() req: any,
    @Body() dto: UpdatePlatformSettingDto,
  ) {
    this.logger.log(`Update platform setting endpoint called: ${key}`);
    return this.platformService.updatePlatformSetting(key, req.user.id, dto);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:manage')
  @InvalidateCache([
    'platform',
    'features',
    'maintenance',
    'kill-switches',
    'settings',
  ])
  @ApiOperation({
    summary: 'Invalidate platform cache (Platform Admin only)',
    description: 'Clear all platform-related cache.',
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
    description: 'Platform cache invalidated',
  })
  async invalidatePlatformCache(
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate platform cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.platformService.invalidatePlatformCache();

    return {
      message: 'Platform cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
    };
  }
}
