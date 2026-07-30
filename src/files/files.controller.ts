import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../common/guards/admin.guard';

@ApiTags('files')
@Controller('files')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(private readonly filesService: FilesService) {}

  @Get('upload-url')
  @ApiOperation({ summary: 'Get upload URL for direct file upload' })
  @ApiQuery({
    name: 'folder',
    required: false,
    description: 'Folder to upload to',
  })
  @ApiResponse({ status: 200, description: 'Upload URL generated' })
  async getUploadUrl(@Query('folder') folder?: string) {
    return this.filesService.generateUploadUrl(folder || 'uploads');
  }

  @Post('upload-complete')
  @ApiOperation({ summary: 'Save file record after upload' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        filename: { type: 'string' },
        mimeType: { type: 'string' },
        size: { type: 'number' },
        folder: { type: 'string' },
        publicId: { type: 'string' },
        organizationId: { type: 'string' },
        purpose: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File record saved' })
  async saveFileRecord(@Request() req: any, @Body() data: any) {
    return this.filesService.saveFileRecord(req.user.id, data);
  }

  @Delete(':publicId')
  @UseGuards(AdminGuard)
  @RequirePermission('files:delete')
  @ApiOperation({ summary: 'Delete file (Admin only)' })
  @ApiParam({ name: 'publicId', description: 'File public ID' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  async deleteFile(@Param('publicId') publicId: string) {
    return this.filesService.deleteFile(publicId);
  }

  @Delete('batch')
  @UseGuards(AdminGuard)
  @RequirePermission('files:delete')
  @ApiOperation({ summary: 'Delete multiple files (Admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { publicIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Files deleted' })
  async deleteFiles(@Body() body: { publicIds: string[] }) {
    return this.filesService.deleteFiles(body.publicIds);
  }

  @Get(':publicId/url')
  @ApiOperation({ summary: 'Get file URL' })
  @ApiParam({ name: 'publicId', description: 'File public ID' })
  @ApiQuery({ name: 'width', required: false, description: 'Image width' })
  @ApiQuery({ name: 'height', required: false, description: 'Image height' })
  @ApiResponse({ status: 200, description: 'File URL' })
  async getFileUrl(
    @Param('publicId') publicId: string,
    @Query('width') width?: number,
    @Query('height') height?: number,
  ) {
    const transformations: any = {};
    if (width) transformations.width = width;
    if (height) transformations.height = height;
    if (width || height) transformations.crop = 'fill';

    const url = await this.filesService.getFileUrl(publicId, transformations);
    return { url };
  }
}
