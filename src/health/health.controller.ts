import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get overall health status' })
  @ApiResponse({ status: 200, description: 'Health status' })
  async getHealth() {
    const [db, cache] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
    ]);

    const isHealthy = db && cache;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: db,
        cache: cache,
      },
      uptime: process.uptime(),
    };
  }

  @Get('db')
  @ApiOperation({ summary: 'Check database health' })
  @ApiResponse({ status: 200, description: 'Database health' })
  async checkDatabaseHealth() {
    const isHealthy = await this.checkDatabase();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('cache')
  @ApiOperation({ summary: 'Check cache health' })
  @ApiResponse({ status: 200, description: 'Cache health' })
  async checkCacheHealth() {
    const isHealthy = await this.checkCache();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkCache(): Promise<boolean> {
    try {
      await this.redisService.getClient().ping();
      return true;
    } catch {
      return false;
    }
  }
}
