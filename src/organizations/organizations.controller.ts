import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
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
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../common/guards/admin.guard';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AddMemberDto,
  UpdateMemberDto,
  OrganizationResponseDto,
  OrganizationListResponseDto,
} from './dto';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class OrganizationsController {
  private readonly logger = new Logger(OrganizationsController.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================
  // ORGANIZATION ENDPOINTS
  // ============================================

  @Post()
  @UseGuards(AdminGuard)
  @RequirePermission('organization:create')
  @ApiOperation({ summary: 'Create a new organization (Admin only)' })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Organization created successfully',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Slug already exists',
  })
  async createOrganization(
    @Request() req: any,
    @Body() dto: CreateOrganizationDto,
  ) {
    this.logger.log(`Create organization endpoint called`);
    return this.organizationsService.createOrganization(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations (Public)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'institutionId',
    required: false,
    description: 'Filter by institution',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'DRAFT',
      'PENDING_ACTIVATION',
      'ACTIVE',
      'INACTIVE',
      'SUSPENDED',
      'ARCHIVED',
    ],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'INSTITUTION',
      'FACULTY',
      'DEPARTMENT',
      'LEVEL',
      'ASSOCIATION',
      'CLUB',
      'RELIGIOUS',
      'SPORTS',
      'SPECIAL',
    ],
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: [
      'INSTITUTION',
      'FACULTY',
      'DEPARTMENT',
      'LEVEL',
      'CROSS_DEPARTMENT',
      'CROSS_LEVEL',
      'CUSTOM',
    ],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or slug',
  })
  @ApiQuery({
    name: 'parentId',
    required: false,
    description: 'Filter by parent organization',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organizations retrieved',
    type: OrganizationListResponseDto,
  })
  async getAllOrganizations(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('institutionId') institutionId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('scope') scope?: string,
    @Query('search') search?: string,
    @Query('parentId') parentId?: string,
  ) {
    this.logger.log('Get all organizations endpoint called');
    return this.organizationsService.getAllOrganizations(
      parseInt(page, 10),
      parseInt(limit, 10),
      { institutionId, status, type, scope, search, parentId },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization retrieved',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Organization not found',
  })
  async getOrganizationById(@Param('id') id: string) {
    this.logger.log(`Get organization by ID endpoint called: ${id}`);
    return this.organizationsService.getOrganizationById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get organization by slug (Public)' })
  @ApiParam({ name: 'slug', description: 'Organization slug' })
  @ApiQuery({
    name: 'institutionId',
    required: true,
    description: 'Institution ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization retrieved',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Organization not found',
  })
  async getOrganizationBySlug(
    @Param('slug') slug: string,
    @Query('institutionId') institutionId: string,
  ) {
    this.logger.log(`Get organization by slug endpoint called: ${slug}`);
    return this.organizationsService.getOrganizationBySlug(slug, institutionId);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:update', 'id')
  @ApiOperation({ summary: 'Update organization (Admin only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization updated',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateOrganization(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateOrganizationDto,
  ) {
    this.logger.log(`Update organization endpoint called: ${id}`);
    return this.organizationsService.updateOrganization(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('organization:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete organization (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Organization deleted' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete organization with related data',
  })
  async deleteOrganization(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete organization endpoint called: ${id}`);
    return this.organizationsService.deleteOrganization(id, req.user.id);
  }

  // ============================================
  // ORGANIZATION ACTIVATION
  // ============================================

  @Post(':id/activate')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:activate', 'id')
  @ApiOperation({ summary: 'Activate organization (Admin only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization activated',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Organization needs at least one active member',
  })
  async activateOrganization(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Activate organization endpoint called: ${id}`);
    return this.organizationsService.activateOrganization(id, req.user.id);
  }

  @Post(':id/archive')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:update', 'id')
  @ApiOperation({ summary: 'Archive organization (Admin only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization archived',
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async archiveOrganization(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Archive organization endpoint called: ${id}`);
    return this.organizationsService.archiveOrganization(id, req.user.id);
  }

  // ============================================
  // MEMBERSHIP ENDPOINTS
  // ============================================

  @Post(':id/members')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members', 'id')
  @ApiOperation({ summary: 'Add member to organization (Admin only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiBody({ type: AddMemberDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Member added successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User is already a member',
  })
  async addMember(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: AddMemberDto,
  ) {
    this.logger.log(`Add member to organization endpoint called: ${id}`);
    return this.organizationsService.addMember(id, req.user.id, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get organization members (Public)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'],
  })
  @ApiQuery({
    name: 'membershipType',
    required: false,
    enum: ['STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or email',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Members retrieved',
  })
  async getMembers(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('membershipType') membershipType?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`Get organization members endpoint called: ${id}`);
    return this.organizationsService.getOrganizationMembers(
      id,
      parseInt(page, 10),
      parseInt(limit, 10),
      { status, membershipType, search },
    );
  }

  @Patch('members/:membershipId')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members')
  @ApiOperation({ summary: 'Update member (Admin only)' })
  @ApiParam({ name: 'membershipId', description: 'Membership ID' })
  @ApiBody({ type: UpdateMemberDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Member updated',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Membership not found',
  })
  async updateMember(
    @Param('membershipId') membershipId: string,
    @Request() req: any,
    @Body() dto: UpdateMemberDto,
  ) {
    // Get organization ID from membership
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      select: { organizationId: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    this.logger.log(`Update member endpoint called: ${membershipId}`);
    return this.organizationsService.updateMember(
      membership.organizationId,
      membershipId,
      req.user.id,
      dto,
    );
  }

  @Delete('members/:membershipId')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from organization (Admin only)' })
  @ApiParam({ name: 'membershipId', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member removed' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Membership not found',
  })
  async removeMember(
    @Param('membershipId') membershipId: string,
    @Request() req: any,
  ) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      select: { organizationId: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    this.logger.log(`Remove member endpoint called: ${membershipId}`);
    return this.organizationsService.removeMember(
      membership.organizationId,
      membershipId,
      req.user.id,
    );
  }

  // ============================================
  // ORGANIZATION STATISTICS
  // ============================================

  @Get('stats')
  @UseGuards(AdminGuard)
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Get organization statistics (Admin only)' })
  @ApiQuery({
    name: 'institutionId',
    required: false,
    description: 'Filter by institution',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization statistics retrieved',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async getStats(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get organization statistics endpoint called');
    return this.organizationsService.getOrganizationStats(institutionId);
  }
}
