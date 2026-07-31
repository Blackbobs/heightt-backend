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
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  UploadFileDto,
  FileResponseDto,
  FileListResponseDto,
} from './dto/file.dto';

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
  @ApiQuery({
    name: 'purpose',
    required: false,
    enum: [
      'avatar',
      'receipt',
      'document',
      'event_banner',
      'profile',
      'verification',
    ],
  })
  @ApiResponse({ status: 200, description: 'Upload URL generated' })
  async getUploadUrl(
    @Query('folder') folder?: string,
    @Query('purpose') purpose?: string,
  ) {
    return this.filesService.generateUploadUrl(folder || 'uploads');
  }

  @Post('upload-complete')
  @ApiOperation({ summary: 'Save file record after upload' })
  @ApiBody({ type: UploadFileDto })
  @ApiResponse({
    status: 201,
    description: 'File record saved',
    type: FileResponseDto,
  })
  async saveFileRecord(@Request() req: any, @Body() data: any) {
    this.logger.log('Save file record endpoint called');
    return this.filesService.saveFileRecord(req.user.id, data);
  }

  @Get()
  @ApiOperation({ summary: 'Get files' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'purpose',
    required: false,
    description: 'Filter by purpose',
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description: 'Filter by organization',
  })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved',
    type: FileListResponseDto,
  })
  async getFiles(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('purpose') purpose?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    this.logger.log('Get files endpoint called');
    return this.filesService.getFiles(
      req.user.id,
      organizationId,
      purpose,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File retrieved',
    type: FileResponseDto,
  })
  async getFileById(@Param('id') id: string) {
    this.logger.log(`Get file by ID endpoint called: ${id}`);
    return this.filesService.getFileById(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  async deleteFile(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete file endpoint called: ${id}`);
    return this.filesService.deleteFile(id, req.user.id);
  }

  @Get(':id/url')
  @ApiOperation({ summary: 'Get file URL' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiQuery({ name: 'width', required: false, description: 'Image width' })
  @ApiQuery({ name: 'height', required: false, description: 'Image height' })
  @ApiResponse({ status: 200, description: 'File URL' })
  async getFileUrl(
    @Param('id') id: string,
    @Query('width') width?: number,
    @Query('height') height?: number,
  ) {
    const file = await this.filesService.getFileById(id);
    const transformations: any = {};
    if (width) transformations.width = width;
    if (height) transformations.height = height;
    if (width || height) transformations.crop = 'fill';

    const url = await this.filesService.getFileUrl(
      file.publicId,
      transformations,
    );
    return { url };
  }
}
