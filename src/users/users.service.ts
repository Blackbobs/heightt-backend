import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { UpdateUserDto, UpdateUserStatusDto } from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

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
   * Get user by ID
   */
  async findById(id: string) {
    // Check cache first
    const cached = await this.cacheService.getUserProfile(id);
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

    // Cache for 5 minutes
    await this.cacheService.cacheUserProfile(id, user);

    return user;
  }

  /**
   * Get user by email
   */
  async findByEmail(email: string) {
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
   * Update user profile
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
      const existing = await this.prisma.user.findFirst({
        where: {
          username: dto.username.toLowerCase(),
          NOT: { id: userId },
        },
      });
      if (existing) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Update user
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      // Update User model
      const userUpdate: any = {};
      if (dto.username) {
        userUpdate.username = dto.username.toLowerCase();
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
            dateOfBirth: dto.dateOfBirth,
            country: dto.country,
            state: dto.state,
            bio: dto.bio,
          },
        });
      }

      return updated;
    });

    // Invalidate cache
    await this.cacheService.invalidateUserCache(userId);

    // Get updated user with profile
    const result = await this.findById(userId);

    this.logger.log(`User profile updated: ${userId}`);

    return {
      message: 'Profile updated successfully',
      user: result,
    };
  }

  /**
   * Update user status (Admin only)
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

    // If user is being deleted, also delete related data?
    if (dto.status === 'DELETED') {
      // Optionally handle cleanup here
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
    await this.cacheService.invalidateUserCache(userId);

    this.logger.log(`User status updated: ${userId} -> ${dto.status}`);

    return {
      message: `User status updated to ${dto.status}`,
      user: updatedUser,
    };
  }

  /**
   * Delete user (Soft delete)
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
      },
    });

    await this.cacheService.invalidateUserCache(userId);

    this.logger.log(`User deleted: ${userId}`);

    return {
      message: 'User deleted successfully',
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
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

    return {
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
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string) {
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

    return sessions;
  }

  /**
   * Revoke all user sessions
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

    this.logger.log(`All sessions revoked for user: ${userId}`);

    return {
      message: `Revoked ${sessions.count} sessions`,
      count: sessions.count,
    };
  }
}
