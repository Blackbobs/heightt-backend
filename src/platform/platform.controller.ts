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
import { JwtGuard } from '../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../common/guards/admin.guard';
import {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
  CreateMaintenanceDto,
  CreateKillSwitchDto,
  UpdatePlatformSettingDto,
} from './dto/feature-flag.dto';

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
  @ApiOperation({ summary: 'Create feature flag (Platform Admin only)' })
  @ApiBody({ type: CreateFeatureFlagDto })
  async createFeatureFlag(
    @Request() req: any,
    @Body() dto: CreateFeatureFlagDto,
  ) {
    return this.platformService.createFeatureFlag(req.user.id, dto);
  }

  @Get('features')
  @ApiOperation({ summary: 'Get all feature flags' })
  async getFeatureFlags() {
    return this.platformService.getFeatureFlags();
  }

  @Get('features/:key')
  @ApiOperation({ summary: 'Get feature flag by key' })
  @ApiParam({ name: 'key', description: 'Feature key' })
  async getFeatureFlag(@Param('key') key: string) {
    return this.platformService.getFeatureFlag(key);
  }

  @Patch('features/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:feature_flag')
  @ApiOperation({ summary: 'Update feature flag (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Feature flag ID' })
  @ApiBody({ type: UpdateFeatureFlagDto })
  async updateFeatureFlag(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    return this.platformService.updateFeatureFlag(id, req.user.id, dto);
  }

  @Delete('features/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:feature_flag')
  @ApiOperation({ summary: 'Delete feature flag (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Feature flag ID' })
  async deleteFeatureFlag(@Param('id') id: string, @Request() req: any) {
    return this.platformService.deleteFeatureFlag(id, req.user.id);
  }

  // ============================================
  // MAINTENANCE MODE
  // ============================================

  @Post('maintenance')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Set maintenance mode (Platform Admin only)' })
  @ApiBody({ type: CreateMaintenanceDto })
  async setMaintenanceMode(
    @Request() req: any,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.platformService.setMaintenanceMode(req.user.id, dto);
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Get maintenance status' })
  async getMaintenanceStatus() {
    return this.platformService.getMaintenanceStatus();
  }

  // ============================================
  // KILL SWITCHES
  // ============================================

  @Post('kill-switches')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
  @ApiOperation({ summary: 'Create kill switch (Platform Admin only)' })
  @ApiBody({ type: CreateKillSwitchDto })
  async createKillSwitch(
    @Request() req: any,
    @Body() dto: CreateKillSwitchDto,
  ) {
    return this.platformService.createKillSwitch(req.user.id, dto);
  }

  @Get('kill-switches')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Get kill switches (Platform Admin only)' })
  async getKillSwitches() {
    return this.platformService.getKillSwitches();
  }

  @Post('kill-switches/:key/toggle')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:maintenance')
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
  @ApiOperation({ summary: 'Get platform settings' })
  @ApiQuery({ name: 'publicOnly', required: false, type: 'boolean' })
  async getPlatformSettings(@Query('publicOnly') publicOnly: string = 'false') {
    return this.platformService.getPlatformSettings(publicOnly === 'true');
  }

  @Get('settings/:key')
  @ApiOperation({ summary: 'Get platform setting by key' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  async getPlatformSetting(@Param('key') key: string) {
    return this.platformService.getPlatformSetting(key);
  }

  @Patch('settings/:key')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('system:update')
  @ApiOperation({ summary: 'Update platform setting (Platform Admin only)' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiBody({ type: UpdatePlatformSettingDto })
  async updatePlatformSetting(
    @Param('key') key: string,
    @Request() req: any,
    @Body() dto: UpdatePlatformSettingDto,
  ) {
    return this.platformService.updatePlatformSetting(key, req.user.id, dto);
  }
}
