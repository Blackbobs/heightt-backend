// src/v1/files/files.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EventService, SystemEvents } from '../../events/event.service';
import { FilePurpose } from './dto/file.dto';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly eventService: EventService,
  ) {
    const cloudName = this.configService.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary environment variables');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateFileCache(userId?: string): Promise<void> {
    try {
      // Invalidate tags
      await this.cacheService.invalidateByTag('files');
      await this.cacheService.invalidateByTag('file-list');
      await this.cacheService.invalidateByTag('file-detail');
      await this.cacheService.invalidateByTag('file-urls');
      await this.cacheService.invalidateByTag('admin-files');

      // Invalidate user-specific file caches
      if (userId) {
        await this.cacheService.invalidateByTag(`user:${userId}`);
        await this.cacheService.invalidatePattern(`files:list:${userId}:*`);
        await this.cacheService.invalidatePattern(`files:admin:*:${userId}:*`);
      }

      this.logger.debug(
        `Files cache invalidated${userId ? ` for user: ${userId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(`Failed to invalidate files cache: ${error.message}`);
    }
  }

  // ============================================
  // UPLOAD URL GENERATION
  // ============================================

  generateUploadUrl(
    folder: string = 'uploads',
    purpose?: string,
  ): {
    apiKey: string;
    cloudName: string;
    folder: string;
    signature: string;
    timestamp: number;
    purpose?: string;
  } {
    try {
      const cloudName = this.configService.get('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.configService.get('CLOUDINARY_API_KEY');
      const apiSecret = this.configService.get('CLOUDINARY_API_SECRET');

      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error('Missing Cloudinary configuration');
      }

      const timestamp = Math.round(new Date().getTime() / 1000);
      const signature = cloudinary.utils.api_sign_request(
        { folder, timestamp },
        apiSecret,
      );

      return {
        apiKey,
        cloudName,
        folder,
        signature,
        timestamp,
        purpose,
      };
    } catch (error) {
      this.logger.error(`Failed to generate upload URL: ${error.message}`);
      throw new BadRequestException('Could not generate upload URL');
    }
  }

  // ============================================
  // SAVE FILE RECORD
  // ============================================

  async saveFileRecord(
    userId: string,
    data: {
      url: string;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      folder: string;
      publicId: string;
      purpose?: string;
      organizationId?: string;
      receiptId?: string;
      studentId?: string;
      eventId?: string;
      metadata?: any;
    },
  ) {
    this.logger.log(`Saving file record: ${data.filename}`);

    // Validate associations
    if (data.organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new NotFoundException('Organization not found');
      }
    }

    if (data.studentId) {
      const student = await this.prisma.studentProfile.findUnique({
        where: { id: data.studentId },
      });
      if (!student) {
        throw new NotFoundException('Student not found');
      }
    }

    if (data.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: data.eventId },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }
    }

    if (data.receiptId) {
      const receipt = await this.prisma.receipt.findUnique({
        where: { id: data.receiptId },
      });
      if (!receipt) {
        throw new NotFoundException('Receipt not found');
      }
    }

    const file = await this.prisma.file.create({
      data: {
        filename: data.filename,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        url: data.url,
        publicId: data.publicId,
        folder: data.folder,
        purpose: data.purpose,
        userId,
        organizationId: data.organizationId,
        receiptId: data.receiptId,
        studentId: data.studentId,
        eventId: data.eventId,
        metadata: data.metadata || {},
      },
    });

    // Emit file uploaded event
    this.eventService.emit(SystemEvents.FILE_UPLOADED, {
      fileId: file.id,
      userId,
      purpose: data.purpose,
      organizationId: data.organizationId,
      filename: data.filename,
      url: data.url,
      size: data.size,
      mimeType: data.mimeType,
    });

    // Invalidate file cache
    await this.invalidateFileCache(userId);

    this.logger.log(`File record saved: ${file.id}`);
    return file;
  }

  // ============================================
  // GET FILES
  // ============================================

  async getFiles(
    userId?: string,
    organizationId?: string,
    purpose?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = { isDeleted: false };

    if (userId) {
      where.userId = userId;
    }
    if (organizationId) {
      where.organizationId = organizationId;
    }
    if (purpose) {
      where.purpose = purpose;
    }

    const skip = (page - 1) * limit;
    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: files,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFileById(fileId: string) {
    // Try cache first
    const cacheKey = `file:${fileId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Cache for 1 hour with tags
    await this.cacheService.setWithTag(
      cacheKey,
      file,
      ['files', 'file-detail'],
      3600,
    );

    return file;
  }

  async getFilesByPurpose(
    userId: string,
    purpose: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.getFiles(userId, undefined, purpose, page, limit);
  }

  async getFilesByEntity(
    entityType: 'student' | 'event' | 'receipt' | 'organization',
    entityId: string,
  ) {
    const where: any = { isDeleted: false };

    switch (entityType) {
      case 'student':
        where.studentId = entityId;
        break;
      case 'event':
        where.eventId = entityId;
        break;
      case 'receipt':
        where.receiptId = entityId;
        break;
      case 'organization':
        where.organizationId = entityId;
        break;
      default:
        throw new BadRequestException(`Invalid entity type: ${entityType}`);
    }

    return this.prisma.file.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================
  // DELETE FILE
  // ============================================

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check ownership
    if (file.userId !== userId) {
      const isAdmin = await this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });
      if (!isAdmin) {
        throw new ForbiddenException(
          'You do not have permission to delete this file',
        );
      }
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(file.publicId);
    } catch (error) {
      this.logger.warn(`Failed to delete from Cloudinary: ${error.message}`);
    }

    // Soft delete in database
    const deleted = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Emit file deleted event
    this.eventService.emit(SystemEvents.FILE_DELETED, {
      fileId,
      userId,
      purpose: file.purpose,
      filename: file.filename,
    });

    // Invalidate file cache
    await this.invalidateFileCache(userId);
    await this.cacheService.delete(`file:${fileId}`);
    await this.cacheService.invalidatePattern(`file:url:${fileId}:*`);

    return deleted;
  }

  async deleteMultipleFiles(fileIds: string[], userId: string) {
    const results = { deleted: 0, failed: [] as string[] };

    for (const fileId of fileIds) {
      try {
        await this.deleteFile(fileId, userId);
        results.deleted++;
      } catch (error) {
        results.failed.push(fileId);
        this.logger.warn(`Failed to delete file ${fileId}: ${error.message}`);
      }
    }

    // Invalidate file cache
    await this.invalidateFileCache(userId);

    return results;
  }

  // ============================================
  // GET FILE URL
  // ============================================

  async getFileUrl(publicId: string, transformations?: any): Promise<string> {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations,
    });
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async getAllFiles(
    userId?: string,
    organizationId?: string,
    purpose?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = { isDeleted: false };

    if (userId) {
      where.userId = userId;
    }
    if (organizationId) {
      where.organizationId = organizationId;
    }
    if (purpose) {
      where.purpose = purpose;
    }

    const skip = (page - 1) * limit;
    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: files,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // FILE STATISTICS
  // ============================================

  async getFileStats(userId?: string) {
    const where: any = { isDeleted: false };
    if (userId) {
      where.userId = userId;
    }

    const [totalFiles, totalSize, byPurpose, recentUploads] = await Promise.all(
      [
        this.prisma.file.count({ where }),
        this.prisma.file.aggregate({
          where,
          _sum: { size: true },
        }),
        this.prisma.file.groupBy({
          by: ['purpose'],
          where,
          _count: { id: true },
        }),
        this.prisma.file.count({
          where: {
            ...where,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ],
    );

    return {
      totalFiles,
      totalSize: totalSize._sum.size || 0,
      totalSizeFormatted: this.formatBytes(totalSize._sum.size || 0),
      byPurpose: byPurpose.reduce(
        (acc, curr) => {
          acc[curr.purpose || 'unknown'] = curr._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
      recentUploads,
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ============================================
  // BULK FILE OPERATIONS
  // ============================================

  async getFilesByOrganization(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.getFiles(undefined, organizationId, undefined, page, limit);
  }

  async getFilesByUser(userId: string, page: number = 1, limit: number = 10) {
    return this.getFiles(userId, undefined, undefined, page, limit);
  }
}
