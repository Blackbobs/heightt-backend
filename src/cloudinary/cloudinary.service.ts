import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary environment variables');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  generateUploadUrl(folder: string = 'avatars'): {
    apiKey: string;
    cloudName: string;
    folder: string;
    signature: string;
    timestamp: number;
  } {
    try {
      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

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

  async deleteImage(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      this.logger.error(`Failed to delete image: ${error.message}`);
      return false;
    }
  }
}
