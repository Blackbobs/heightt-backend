import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { UpdateUserDto, UpdateUserStatusDto } from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // USERNAME AVAILABILITY
  // ============================================

  /**
   * Check if a username is available
   */
  async checkUsernameAvailability(
    username: string,
    excludeUserId?: string,
  ): Promise<{ available: boolean; username: string; message: string }> {
    // Build the where clause
    const where: any = {
      username: {
        equals: username,
        mode: 'insensitive',
      },
    };

    // Exclude a specific user ID (for updates)
    if (excludeUserId) {
      where.id = {
        not: excludeUserId,
      };
    }

    // Check if user exists with this username
    const existingUser = await this.prisma.user.findFirst({
      where,
      select: { id: true, username: true },
    });

    if (existingUser) {
      return {
        available: false,
        username,
        message: `Username "${username}" is already taken`,
      };
    }

    return {
      available: true,
      username,
      message: `Username "${username}" is available`,
    };
  }

  /**
   * Generate username suggestions
   */
  async generateUsernameSuggestions(baseUsername: string): Promise<string[]> {
    const suggestions: string[] = [];
    const maxAttempts = 5;

    // Clean up the base username
    let cleanBase = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');

    // If empty after cleaning, use a default
    if (!cleanBase) {
      cleanBase = 'user';
    }

    // Truncate to a reasonable length
    if (cleanBase.length > 20) {
      cleanBase = cleanBase.substring(0, 20);
    }

    // Generate suggestions with different suffixes
    const suffixOptions = [
      '', // Original cleaned version
      '1',
      '2',
      '3',
      '_',
      '_01',
      '2024',
      '2025',
    ];

    for (const suffix of suffixOptions) {
      if (suggestions.length >= maxAttempts) break;

      let candidate = cleanBase;
      if (suffix) {
        candidate = `${cleanBase}${suffix}`;
      }

      // Check if the candidate is available
      const isAvailable = await this.isUsernameAvailable(candidate);
      if (isAvailable && !suggestions.includes(candidate)) {
        suggestions.push(candidate);
      }
    }

    // If still no suggestions, add some with random numbers
    for (let i = 0; i < maxAttempts - suggestions.length; i++) {
      const randomSuffix = Math.floor(Math.random() * 1000);
      const candidate = `${cleanBase}${randomSuffix}`;
      const isAvailable = await this.isUsernameAvailable(candidate);
      if (isAvailable && !suggestions.includes(candidate)) {
        suggestions.push(candidate);
      }
    }

    return suggestions;
  }

  /**
   * Check if a username is available (internal helper)
   */
  private async isUsernameAvailable(username: string): Promise<boolean> {
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return !existingUser;
  }

  // ============================================
  // EMAIL AVAILABILITY
  // ============================================

  /**
   * Check if an email is available
   */
  async checkEmailAvailability(
    email: string,
    excludeUserId?: string,
  ): Promise<{ available: boolean; email: string; message: string }> {
    const where: any = {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    };

    if (excludeUserId) {
      where.id = {
        not: excludeUserId,
      };
    }

    const existingUser = await this.prisma.user.findFirst({
      where,
      select: { id: true, email: true },
    });

    if (existingUser) {
      return {
        available: false,
        email,
        message: `Email "${email}" is already registered`,
      };
    }

    return {
      available: true,
      email,
      message: `Email "${email}" is available`,
    };
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateUsersCache(userId?: string): Promise<void> {
    try {
      // Invalidate all user tags
      await this.cacheService.invalidateByTag('users');
      await this.cacheService.invalidateByTag('user');
      await this.cacheService.invalidateByTag('stats');
      await this.cacheService.invalidateByTag('sessions');

      if (userId) {
        // Invalidate specific user caches
        await this.cacheService.delete(`user:profile:${userId}`);
        await this.cacheService.delete(`user:sessions:${userId}`);
        await this.cacheService.invalidateUserCache(userId);

        // Get user to invalidate email cache
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, username: true },
        });
        if (user) {
          await this.cacheService.delete(`user:email:${user.email}`);
          await this.cacheService.delete(`user:username:${user.username}`);
        }
      }

      // Invalidate all patterns
      await this.cacheService.invalidatePattern('user:*');
      await this.cacheService.invalidatePattern('users:*');

      this.logger.log(
        `Users cache invalidated${userId ? ` for user: ${userId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(`Failed to invalidate users cache: ${error.message}`);
    }
  }

  // ============================================
  // USER CRUD OPERATIONS
  // ============================================

  /**
   * Get all users with pagination and filtering
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    filters?: {
      email?: string;
      username?: string;
      status?: string;
      createdAfter?: string;
      createdBefore?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.email) {
      where.email = { contains: filters.email, mode: 'insensitive' };
    }
    if (filters?.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.createdAfter) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(filters.createdAfter),
      };
    }
    if (filters?.createdBefore) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(filters.createdBefore),
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          profile: true,
          studentProfile: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID with caching
   */
  async findById(id: string) {
    // Check cache first
    const cacheKey = `user:profile:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`User ${id} found in cache`);
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cache for 5 minutes with tags
    await this.cacheService.setWithTag(cacheKey, user, ['users', 'user'], 300);

    return user;
  }

  /**
   * Get user by email with caching
   */
  async findByEmail(email: string) {
    const cacheKey = `user:email:${email.toLowerCase()}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cache for 5 minutes with tags
    await this.cacheService.setWithTag(cacheKey, user, ['users', 'user'], 300);

    return user;
  }

  /**
   * Get user by username
   */
  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user profile with cache invalidation
   */
  async updateProfile(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if username is being updated and is unique
    if (dto.username) {
      const isAvailable = await this.isUsernameAvailable(dto.username);
      if (!isAvailable) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Check if email is being updated and is unique
    if (dto.email) {
      const emailCheck = await this.checkEmailAvailability(dto.email, userId);
      if (!emailCheck.available) {
        throw new ConflictException('Email is already registered');
      }
    }

    // Update user
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      // Update User model
      const userUpdate: any = {};
      if (dto.username) {
        userUpdate.username = dto.username.toLowerCase();
      }
      if (dto.email) {
        userUpdate.email = dto.email.toLowerCase();
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: userUpdate,
      });

      // Update UserProfile
      if (
        dto.firstName ||
        dto.lastName ||
        dto.phone ||
        dto.avatar ||
        dto.gender ||
        dto.dateOfBirth ||
        dto.country ||
        dto.state ||
        dto.bio
      ) {
        await tx.userProfile.update({
          where: { userId },
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            avatar: dto.avatar,
            gender: dto.gender as any,
            dateOfBirth: dto.dateOfBirth
              ? new Date(dto.dateOfBirth)
              : undefined,
            country: dto.country,
            state: dto.state,
            bio: dto.bio,
          },
        });
      }

      return updated;
    });

    // Invalidate cache
    await this.invalidateUsersCache(userId);

    // Get updated user with profile
    const result = await this.findById(userId);

    this.logger.log(`User profile updated: ${userId}`);

    return {
      message: 'Profile updated successfully',
      user: result,
    };
  }

  /**
   * Update user status (Admin only) with cache invalidation
   */
  async updateStatus(userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === dto.status) {
      throw new BadRequestException(`User is already ${dto.status}`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: dto.status as any,
      },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    // If user is being deleted, log it
    if (dto.status === 'DELETED') {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'USER_DELETED',
          entity: 'User',
          entityId: userId,
          metadata: { reason: dto.reason },
        },
      });
    }

    // Invalidate cache
    await this.invalidateUsersCache(userId);

    this.logger.log(`User status updated: ${userId} -> ${dto.status}`);

    return {
      message: `User status updated to ${dto.status}`,
      user: updatedUser,
    };
  }

  /**
   * Delete user (Soft delete) with cache invalidation
   */
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === 'DELETED') {
      throw new BadRequestException('User is already deleted');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_DELETED',
        entity: 'User',
        entityId: userId,
        metadata: { reason: 'Soft deleted' },
      },
    });

    // Invalidate cache
    await this.invalidateUsersCache(userId);

    this.logger.log(`User deleted: ${userId}`);

    return {
      message: 'User deleted successfully',
    };
  }

  // ============================================
  // USER STATISTICS
  // ============================================

  /**
   * Get user statistics with caching
   */
  async getUserStats() {
    const cacheKey = 'users:stats';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [
      total,
      active,
      inactive,
      suspended,
      deleted,
      verified,
      unverified,
      withStudentProfile,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'INACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { status: 'DELETED' } }),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.user.count({ where: { emailVerified: false } }),
      this.prisma.studentProfile.count(),
    ]);

    const stats = {
      total,
      byStatus: {
        active,
        inactive,
        suspended,
        deleted,
      },
      verification: {
        verified,
        unverified,
      },
      studentProfiles: withStudentProfile,
    };

    // Cache for 10 minutes with tags
    await this.cacheService.setWithTag(
      cacheKey,
      stats,
      ['users', 'stats'],
      600,
    );

    return stats;
  }

  // ============================================
  // USER SESSIONS
  // ============================================

  /**
   * Get user sessions with caching
   */
  async getUserSessions(userId: string) {
    const cacheKey = `user:sessions:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        revokedAt: null,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
      select: {
        id: true,
        deviceName: true,
        browser: true,
        operatingSystem: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    // Cache for 1 minute with tags
    await this.cacheService.setWithTag(
      cacheKey,
      sessions,
      ['users', 'sessions'],
      60,
    );

    return sessions;
  }

  /**
   * Revoke all user sessions with cache invalidation
   */
  async revokeAllSessions(userId: string) {
    const sessions = await this.prisma.session.updateMany({
      where: {
        userId,
        isActive: true,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        isActive: false,
        revokedReason: 'Revoked by admin',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'SESSIONS_REVOKED',
        entity: 'User',
        entityId: userId,
        metadata: { count: sessions.count },
      },
    });

    // Invalidate session cache
    await this.invalidateUsersCache(userId);

    this.logger.log(`All sessions revoked for user: ${userId}`);

    return {
      message: `Revoked ${sessions.count} sessions`,
      count: sessions.count,
    };
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Bulk update user statuses
   */
  async bulkUpdateStatus(userIds: string[], status: string, reason?: string) {
    this.logger.log(`Bulk updating ${userIds.length} users to ${status}`);

    const results: any[] = [];

    for (const userId of userIds) {
      try {
        const result = await this.updateStatus(userId, {
          status: status as any,
          reason,
        });
        results.push({ success: true, userId, result });
      } catch (error) {
        results.push({
          success: false,
          userId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidateUsersCache();

    this.logger.log(`Bulk status update completed`);
    return results;
  }

  /**
   * Bulk delete users
   */
  async bulkDeleteUsers(userIds: string[]) {
    this.logger.log(`Bulk deleting ${userIds.length} users`);

    const results: any[] = [];

    for (const userId of userIds) {
      try {
        const result = await this.deleteUser(userId);
        results.push({ success: true, userId, result });
      } catch (error) {
        results.push({
          success: false,
          userId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidateUsersCache();

    this.logger.log(`Bulk delete completed`);
    return results;
  }

  // ============================================
  // ADDITIONAL HELPER METHODS
  // ============================================

  /**
   * Check if user exists
   */
  async userExists(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * Check if username exists
   */
  async usernameExists(username: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * Get user by ID with minimal data (for authentication)
   */
  async findByIdMinimal(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        emailVerified: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get all users with their roles
   */
  async getUsersWithRoles(filters?: { organizationId?: string }) {
    const where: any = {};
    if (filters?.organizationId) {
      where.organizationMemberships = {
        some: {
          organizationId: filters.organizationId,
        },
      };
    }

    return this.prisma.user.findMany({
      where,
      include: {
        profile: true,
        organizationMemberships: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get user activity timeline
   */
  async getUserActivity(userId: string, limit: number = 20) {
    const [auditLogs, sessions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          deviceName: true,
          browser: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
    ]);

    return {
      auditLogs,
      sessions,
    };
  }

  /**
   * Search users by name, email, or username
   */
  async searchUsers(query: string, limit: number = 10) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          {
            profile: {
              firstName: { contains: query, mode: 'insensitive' },
            },
          },
          {
            profile: {
              lastName: { contains: query, mode: 'insensitive' },
            },
          },
        ],
      },
      include: {
        profile: true,
        studentProfile: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Export users data
   */
  async exportUsers(filters?: {
    status?: string;
    createdAfter?: string;
    createdBefore?: string;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.createdAfter) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(filters.createdAfter),
      };
    }
    if (filters?.createdBefore) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(filters.createdBefore),
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        profile: true,
        studentProfile: {
          include: {
            institution: {
              select: {
                name: true,
              },
            },
            department: {
              select: {
                name: true,
              },
            },
            currentAcademicLevel: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      emailVerified: user.emailVerified,
      firstName: user.profile?.firstName || '',
      lastName: user.profile?.lastName || '',
      phone: user.profile?.phone || '',
      gender: user.profile?.gender || '',
      dateOfBirth: user.profile?.dateOfBirth,
      country: user.profile?.country || '',
      state: user.profile?.state || '',
      city: user.profile?.city || '',
      institution: user.studentProfile?.institution?.name || '',
      department: user.studentProfile?.department?.name || '',
      level: user.studentProfile?.currentAcademicLevel?.name || '',
      matricNumber: user.studentProfile?.matricNumber || '',
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));
  }
}
