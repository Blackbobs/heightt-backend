import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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

  generateUploadUrl(folder: string = 'uploads'): {
    apiKey: string;
    cloudName: string;
    folder: string;
    signature: string;
    timestamp: number;
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
      };
    } catch (error) {
      this.logger.error(`Failed to generate upload URL: ${error.message}`);
      throw new BadRequestException('Could not generate upload URL');
    }
  }

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
    },
  ) {
    this.logger.log(`Saving file record: ${data.filename}`);

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
      },
    });

    this.logger.log(`File record saved: ${file.id}`);
    return file;
  }

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
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

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

    return deleted;
  }

  async getFileUrl(publicId: string, transformations?: any): Promise<string> {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations,
    });
  }
}
