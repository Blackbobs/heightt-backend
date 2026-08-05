// src/v1/files/files.controller.ts
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
  HttpCode,
  HttpStatus,
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
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import {
  UploadFileDto,
  FileResponseDto,
  FileListResponseDto,
  GetUploadUrlDto,
  DeleteFilesDto,
  FileStatsResponseDto,
  FilePurpose,
} from './dto/file.dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('files')
@Controller('files')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(private readonly filesService: FilesService) {}

  // ============================================
  // UPLOAD URL (NO CACHE - needs fresh signature)
  // ============================================

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
    enum: FilePurpose,
  })
  @ApiResponse({ status: 200, description: 'Upload URL generated' })
  async getUploadUrl(
    @Query('folder') folder?: string,
    @Query('purpose') purpose?: string,
  ) {
    this.logger.log('Get upload URL endpoint called');
    // DON'T CACHE - each request needs unique signature with timestamp
    return this.filesService.generateUploadUrl(folder || 'uploads', purpose);
  }

  // ============================================
  // FILE UPLOAD COMPLETE (Invalidates cache)
  // ============================================

  @Post('upload-complete')
  @InvalidateCache(['files', 'file-list'])
  @ApiOperation({ summary: 'Save file record after upload' })
  @ApiBody({ type: UploadFileDto })
  @ApiResponse({
    status: 201,
    description: 'File record saved',
    type: FileResponseDto,
  })
  async saveFileRecord(@Request() req: any, @Body() data: UploadFileDto) {
    this.logger.log('Save file record endpoint called');
    const file = await this.filesService.saveFileRecord(req.user.id, data);

    // Invalidate user's file list cache
    await this.filesService.invalidateFileCache(req.user.id);

    return file;
  }

  // ============================================
  // GET FILES (Cached)
  // ============================================

  @Get()
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { page, limit, purpose, organizationId } = request.query;
      const userId = request.user.id;
      return `files:list:${userId}:${organizationId || 'all'}:${purpose || 'all'}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['files', 'file-list'],
  })
  @ApiOperation({ summary: 'Get files' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'purpose',
    required: false,
    enum: FilePurpose,
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

  @Get('purpose/:purpose')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { purpose } = request.params;
      const { page, limit } = request.query;
      return `files:purpose:${purpose}:${request.user.id}:${page || 1}:${limit || 10}`;
    },
    ttl: 300,
    tags: ['files', 'file-list'],
  })
  @ApiOperation({ summary: 'Get files by purpose' })
  @ApiParam({ name: 'purpose', enum: FilePurpose })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved',
    type: FileListResponseDto,
  })
  async getFilesByPurpose(
    @Param('purpose') purpose: string,
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(`Get files by purpose endpoint called: ${purpose}`);
    return this.filesService.getFilesByPurpose(
      req.user.id,
      purpose,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('entity/:entityType/:entityId')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { entityType, entityId } = request.params;
      return `files:entity:${entityType}:${entityId}`;
    },
    ttl: 300,
    tags: ['files', 'file-list'],
  })
  @ApiOperation({
    summary: 'Get files by entity (student, event, receipt, organization)',
  })
  @ApiParam({
    name: 'entityType',
    enum: ['student', 'event', 'receipt', 'organization'],
  })
  @ApiParam({ name: 'entityId', description: 'Entity ID' })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved',
    type: FileListResponseDto,
  })
  async getFilesByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    this.logger.log(
      `Get files by entity endpoint called: ${entityType}/${entityId}`,
    );
    return this.filesService.getFilesByEntity(entityType as any, entityId);
  }

  // ============================================
  // GET FILE BY ID (Cached)
  // ============================================

  @Get(':id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `file:${request.params.id}`;
    },
    ttl: 3600, // 1 hour - file metadata rarely changes
    tags: ['files', 'file-detail'],
  })
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

  // ============================================
  // DELETE FILE (Invalidates cache)
  // ============================================

  @Delete(':id')
  @InvalidateCache(['files', 'file-list', 'file-detail'])
  @ApiOperation({ summary: 'Delete file' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  async deleteFile(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete file endpoint called: ${id}`);
    const result = await this.filesService.deleteFile(id, req.user.id);

    // Invalidate user's file list cache
    await this.filesService.invalidateFileCache(req.user.id);

    return result;
  }

  // ============================================
  // BULK DELETE (Invalidates cache)
  // ============================================

  @Post('delete/bulk')
  @InvalidateCache(['files', 'file-list', 'file-detail'])
  @ApiOperation({ summary: 'Delete multiple files' })
  @ApiBody({ type: DeleteFilesDto })
  @ApiResponse({
    status: 200,
    description: 'Files deleted',
  })
  async deleteMultipleFiles(@Request() req: any, @Body() dto: DeleteFilesDto) {
    this.logger.log('Delete multiple files endpoint called');
    const result = await this.filesService.deleteMultipleFiles(
      dto.fileIds,
      req.user.id,
    );
    return result;
  }

  // ============================================
  // GET FILE URL (Cached - Long TTL)
  // ============================================

  @Get(':id/url')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { id } = request.params;
      const { width, height } = request.query;
      return `file:url:${id}:${width || 'original'}:${height || 'original'}`;
    },
    ttl: 86400, // 24 hours - URLs are static
    tags: ['files', 'file-urls'],
  })
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
    this.logger.log(`Get file URL endpoint called: ${id}`);
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

  // ============================================
  // FILE STATISTICS
  // ============================================

  @Get('stats')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `files:stats:${request.user.id}`;
    },
    ttl: 300,
    tags: ['files', 'stats'],
  })
  @ApiOperation({ summary: 'Get file statistics' })
  @ApiResponse({
    status: 200,
    description: 'File statistics retrieved',
    type: FileStatsResponseDto,
  })
  async getFileStats(@Request() req: any) {
    this.logger.log('Get file stats endpoint called');
    return this.filesService.getFileStats(req.user.id);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get('admin/all')
  @UseGuards(AdminGuard)
  @RequirePermission('files:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { page, limit, purpose, organizationId, userId } = request.query;
      return `files:admin:${page || 1}:${limit || 10}:${userId || 'all'}:${organizationId || 'all'}:${purpose || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['files', 'admin-files'],
  })
  @ApiOperation({ summary: 'Get all files (Admin only)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user' })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description: 'Filter by organization',
  })
  @ApiQuery({
    name: 'purpose',
    required: false,
    enum: FilePurpose,
  })
  @ApiResponse({
    status: 200,
    description: 'All files retrieved',
    type: FileListResponseDto,
  })
  async getAllFiles(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('purpose') purpose?: string,
  ) {
    this.logger.log('Get all files endpoint called (admin)');
    return this.filesService.getAllFiles(
      userId,
      organizationId,
      purpose,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('files:manage')
  @InvalidateCache([
    'files',
    'file-list',
    'file-detail',
    'file-urls',
    'admin-files',
    'stats',
  ])
  @ApiOperation({
    summary: 'Invalidate files cache (Admin only)',
    description: 'Clear all files-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Specific user to invalidate (optional)',
        },
        reason: {
          type: 'string',
          description: 'Reason for invalidating cache',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Files cache invalidated',
  })
  async invalidateFilesCache(
    @Body() body: { userId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate files cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.filesService.invalidateFileCache(body.userId);

    return {
      message: 'Files cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      userId: body.userId || 'all users',
    };
  }
}
