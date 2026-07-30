import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
      mimeType: string;
      size: number;
      folder: string;
      publicId: string;
      organizationId?: string;
      purpose?: string;
    },
  ) {
    // Store file reference in database
    // This assumes you have a File model in your schema
    // If not, you can use the existing models or create a new one

    return {
      url: data.url,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      folder: data.folder,
      publicId: data.publicId,
      userId,
      organizationId: data.organizationId,
      purpose: data.purpose,
    };
  }

  async deleteFile(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new BadRequestException('Failed to delete file');
    }
  }

  async deleteFiles(
    publicIds: string[],
  ): Promise<{ success: string[]; failed: string[] }> {
    const results = {
      success: [] as string[],
      failed: [] as string[],
    };

    for (const publicId of publicIds) {
      try {
        const result = await cloudinary.uploader.destroy(publicId);
        if (result.result === 'ok') {
          results.success.push(publicId);
        } else {
          results.failed.push(publicId);
        }
      } catch {
        results.failed.push(publicId);
      }
    }

    return results;
  }

  async getFileUrl(publicId: string, transformations?: any): Promise<string> {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations,
    });
  }
}
