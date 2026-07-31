import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
  CreateMaintenanceDto,
  CreateKillSwitchDto,
  UpdatePlatformSettingDto,
} from './dto/feature-flag.dto';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // FEATURE FLAGS
  // ============================================

  async createFeatureFlag(userId: string, dto: CreateFeatureFlagDto) {
    this.logger.log(`Creating feature flag: ${dto.key}`);

    const existing = await this.prisma.featureFlag.findUnique({
      where: { key: dto.key },
    });

    if (existing) {
      throw new ConflictException('Feature flag with this key already exists');
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled || false,
        percentage: dto.percentage || 100,
      },
    });

    await this.cacheService.delete('feature_flags:all');

    this.logger.log(`Feature flag created: ${flag.id}`);
    return flag;
  }

  async getFeatureFlags() {
    const cacheKey = 'feature_flags:all';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const flags = await this.prisma.featureFlag.findMany({
      include: {
        targets: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.cacheService.set(cacheKey, flags, 300);
    return flags;
  }

  async getFeatureFlag(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: {
        targets: true,
      },
    });

    if (!flag) {
      throw new NotFoundException('Feature flag not found');
    }

    return flag;
  }

  async updateFeatureFlag(
    id: string,
    userId: string,
    dto: UpdateFeatureFlagDto,
  ) {
    this.logger.log(`Updating feature flag: ${id}`);

    const flag = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!flag) {
      throw new NotFoundException('Feature flag not found');
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
        percentage: dto.percentage,
      },
    });

    await this.cacheService.delete('feature_flags:all');

    this.logger.log(`Feature flag updated: ${id}`);
    return updated;
  }

  async deleteFeatureFlag(id: string, userId: string) {
    this.logger.log(`Deleting feature flag: ${id}`);

    const flag = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!flag) {
      throw new NotFoundException('Feature flag not found');
    }

    const deleted = await this.prisma.featureFlag.delete({
      where: { id },
    });

    await this.cacheService.delete('feature_flags:all');

    this.logger.log(`Feature flag deleted: ${id}`);
    return deleted;
  }

  async isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: {
        targets: {
          include: {
            organization: true,
            role: true,
          },
        },
      },
    });

    if (!flag || !flag.enabled) {
      return false;
    }

    // Check percentage rollout
    if (flag.percentage < 100 && userId) {
      const hash = this.hashUserId(userId);
      if (hash > flag.percentage) {
        return false;
      }
    }

    return true;
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 100;
  }

  // ============================================
  // MAINTENANCE MODE
  // ============================================

  async setMaintenanceMode(userId: string, dto: CreateMaintenanceDto) {
    this.logger.log(`Setting maintenance mode: ${dto.enabled}`);

    const existing = await this.prisma.maintenanceMode.findFirst();
    let maintenance;

    if (existing) {
      maintenance = await this.prisma.maintenanceMode.update({
        where: { id: existing.id },
        data: {
          enabled: dto.enabled,
          message: dto.message,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
    } else {
      maintenance = await this.prisma.maintenanceMode.create({
        data: {
          enabled: dto.enabled,
          message: dto.message,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
    }

    await this.cacheService.delete('maintenance:status');

    this.logger.log(`Maintenance mode set: ${dto.enabled}`);
    return maintenance;
  }

  async getMaintenanceStatus() {
    const cacheKey = 'maintenance:status';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const status = await this.prisma.maintenanceMode.findFirst();
    const result = status || { enabled: false, message: null };

    await this.cacheService.set(cacheKey, result, 60);
    return result;
  }

  // ============================================
  // KILL SWITCHES
  // ============================================

  async createKillSwitch(userId: string, dto: CreateKillSwitchDto) {
    this.logger.log(`Creating kill switch: ${dto.key}`);

    const existing = await this.prisma.killSwitch.findUnique({
      where: { key: dto.key },
    });

    if (existing) {
      throw new ConflictException('Kill switch with this key already exists');
    }

    const killSwitch = await this.prisma.killSwitch.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
      },
    });

    this.logger.log(`Kill switch created: ${killSwitch.id}`);
    return killSwitch;
  }

  async getKillSwitches() {
    return this.prisma.killSwitch.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleKillSwitch(key: string, userId: string, enabled: boolean) {
    this.logger.log(`Toggling kill switch: ${key} -> ${enabled}`);

    const killSwitch = await this.prisma.killSwitch.findUnique({
      where: { key },
    });

    if (!killSwitch) {
      throw new NotFoundException('Kill switch not found');
    }

    const updated = await this.prisma.killSwitch.update({
      where: { id: killSwitch.id },
      data: { enabled },
    });

    this.logger.log(`Kill switch toggled: ${key} -> ${enabled}`);
    return updated;
  }

  async isKillSwitchEnabled(key: string): Promise<boolean> {
    const killSwitch = await this.prisma.killSwitch.findUnique({
      where: { key },
    });

    return killSwitch?.enabled || false;
  }

  // ============================================
  // PLATFORM SETTINGS
  // ============================================

  async getPlatformSettings(publicOnly: boolean = false) {
    const where: any = {};
    if (publicOnly) {
      where.isPublic = true;
    }

    return this.prisma.platformSetting.findMany({
      where,
      orderBy: { key: 'asc' },
    });
  }

  async getPlatformSetting(key: string) {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    return setting;
  }

  async updatePlatformSetting(
    key: string,
    userId: string,
    dto: UpdatePlatformSettingDto,
  ) {
    this.logger.log(`Updating platform setting: ${key}`);

    const setting = await this.prisma.platformSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    const updated = await this.prisma.platformSetting.update({
      where: { key },
      data: {
        value: dto.value,
        description: dto.description,
      },
    });

    this.logger.log(`Platform setting updated: ${key}`);
    return updated;
  }
}
