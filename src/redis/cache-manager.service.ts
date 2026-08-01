// src/redis/cache-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheManagerService {
  private readonly logger = new Logger(CacheManagerService.name);

  constructor(private readonly cacheService: CacheService) {}

  // ============================================
  // User Cache
  // ============================================

  async getUserProfile(userId: string) {
    return this.cacheService.remember(
      `user:profile:${userId}`,
      300, // 5 minutes
      async () => {
        // In real implementation, this would fetch from database
        this.logger.debug(`Fetching user ${userId} from database`);
        return null;
      },
    );
  }

  async invalidateUserProfile(userId: string) {
    await this.cacheService.invalidateByTag(`user:${userId}`);
    await this.cacheService.delete(`user:profile:${userId}`);
    this.logger.debug(`Invalidated user ${userId} cache`);
  }

  async invalidateUserProfiles(userIds: string[]) {
    await Promise.all(userIds.map((id) => this.invalidateUserProfile(id)));
  }

  // ============================================
  // Organization Cache
  // ============================================

  async getOrganization(organizationId: string) {
    return this.cacheService.remember(
      `organization:${organizationId}`,
      600, // 10 minutes
      async () => {
        this.logger.debug(
          `Fetching organization ${organizationId} from database`,
        );
        return null;
      },
    );
  }

  async invalidateOrganization(organizationId: string) {
    await this.cacheService.invalidateByTag(`organization:${organizationId}`);
    await this.cacheService.delete(`organization:${organizationId}`);
    this.logger.debug(`Invalidated organization ${organizationId} cache`);
  }

  // ============================================
  // Wallet Cache
  // ============================================

  async getWallet(userId: string) {
    return this.cacheService.remember(
      `wallet:user:${userId}`,
      60, // 1 minute (balances change often)
      async () => {
        this.logger.debug(`Fetching wallet for user ${userId} from database`);
        return null;
      },
    );
  }

  async invalidateWallet(userId: string) {
    await this.cacheService.invalidateByTag(`wallet:${userId}`);
    await this.cacheService.delete(`wallet:user:${userId}`);
    this.logger.debug(`Invalidated wallet for user ${userId}`);
  }

  // ============================================
  // Transaction Cache
  // ============================================

  async getTransaction(transactionId: string) {
    return this.cacheService.remember(
      `transaction:${transactionId}`,
      3600, // 1 hour
      async () => {
        this.logger.debug(
          `Fetching transaction ${transactionId} from database`,
        );
        return null;
      },
    );
  }

  async invalidateTransaction(transactionId: string) {
    await this.cacheService.delete(`transaction:${transactionId}`);
    this.logger.debug(`Invalidated transaction ${transactionId}`);
  }

  // ============================================
  // Due/Assignment Cache
  // ============================================

  async getStudentDues(studentId: string) {
    return this.cacheService.remember(
      `student:dues:${studentId}`,
      300, // 5 minutes
      async () => {
        this.logger.debug(
          `Fetching dues for student ${studentId} from database`,
        );
        return null;
      },
    );
  }

  async invalidateStudentDues(studentId: string) {
    await this.cacheService.invalidateByTag(`student:${studentId}:dues`);
    await this.cacheService.delete(`student:dues:${studentId}`);
    this.logger.debug(`Invalidated dues for student ${studentId}`);
  }

  // ============================================
  // Analytics Cache
  // ============================================

  async getOrganizationAnalytics(organizationId: string) {
    return this.cacheService.remember(
      `analytics:organization:${organizationId}`,
      1800, // 30 minutes
      async () => {
        this.logger.debug(
          `Fetching analytics for organization ${organizationId} from database`,
        );
        return null;
      },
    );
  }

  async invalidateOrganizationAnalytics(organizationId: string) {
    await this.cacheService.invalidateByTag(
      `analytics:organization:${organizationId}`,
    );
    await this.cacheService.delete(`analytics:organization:${organizationId}`);
    this.logger.debug(
      `Invalidated analytics for organization ${organizationId}`,
    );
  }

  // ============================================
  // Bulk Operations
  // ============================================

  async getMultipleUserProfiles(userIds: string[]) {
    const keys = userIds.map((id) => `user:profile:${id}`);
    const results = await this.cacheService.mget(keys);
    return results.map((result, index) => ({
      userId: userIds[index],
      data: result,
    }));
  }

  // ============================================
  // Cache Warmup
  // ============================================

  async warmupCommonCaches(): Promise<void> {
    this.logger.log('Warming up common caches...');

    // Warmup system settings
    // Warmup public data
    // Warmup popular organizations

    this.logger.log('Cache warmup complete');
  }

  // ============================================
  // Cache Statistics
  // ============================================

  async getCacheStats() {
    return this.cacheService.getStats();
  }
}
