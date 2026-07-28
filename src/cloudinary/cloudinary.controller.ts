import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { JwtGuard } from '../common/guards/jwt.guard';

@Controller('cloudinary')
@UseGuards(JwtGuard)
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Get('upload-url')
  getUploadUrl(@Query('folder') folder?: string) {
    return this.cloudinaryService.generateUploadUrl(folder || 'avatars');
  }
}
