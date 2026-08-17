// src/v1/organizations/organizations.controller.ts

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
  BadRequestException,
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
import { PrismaService } from '../../prisma/prisma.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../../common/guards/admin.guard';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AddMemberDto,
  UpdateMemberDto,
  OrganizationResponseDto,
  OrganizationListResponseDto,
} from './dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

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
  @InvalidateCache(['organizations', 'stats'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const {
        page,
        limit,
        institutionId,
        status,
        type,
        scope,
        search,
        parentId,
      } = request.query;
      return `organizations:${page || 1}:${limit || 10}:${institutionId || 'all'}:${status || 'all'}:${type || 'all'}:${scope || 'all'}:${search || 'all'}:${parentId || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['organizations'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `organization:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['organizations'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { slug } = request.params;
      const { institutionId } = request.query;
      return `organization:slug:${slug}:${institutionId}`;
    },
    ttl: 300, // 5 minutes
    tags: ['organizations'],
  })
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
  @InvalidateCache(['organizations', 'stats'])
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
  @InvalidateCache(['organizations', 'stats'])
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
  @InvalidateCache(['organizations', 'stats'])
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
  @InvalidateCache(['organizations', 'stats'])
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
  @InvalidateCache(['organizations', 'members'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { id } = request.params;
      const { page, limit, status, membershipType, search } = request.query;
      return `organization:${id}:members:${page || 1}:${limit || 10}:${status || 'all'}:${membershipType || 'all'}:${search || 'all'}`;
    },
    ttl: 120, // 2 minutes
    tags: ['organizations', 'members'],
  })
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
  @InvalidateCache(['organizations', 'members'])
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
  @InvalidateCache(['organizations', 'members'])
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
  // ORGANIZATION JOIN REQUEST ENDPOINTS
  // ============================================

  @Post(':id/join-request')
  @ApiOperation({
    summary: 'Request to join an organization',
    description:
      'Submit a request to join an organization. Admins will review and approve/reject.',
  })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        membershipType: {
          type: 'string',
          enum: ['STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'],
          default: 'STUDENT',
        },
        message: {
          type: 'string',
          description: 'Optional message to the admins',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Join request submitted successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User already has a pending request or is already a member',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Organization not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Organization is not active or student profile missing',
  })
  async requestToJoin(
    @Param('id') organizationId: string,
    @Request() req: any,
    @Body() body: { membershipType?: string; message?: string },
  ) {
    this.logger.log(
      `Request to join organization endpoint called: ${organizationId}`,
    );
    return this.organizationsService.requestToJoin(
      req.user.id,
      organizationId,
      (body.membershipType as any) || 'STUDENT',
      body.message,
    );
  }

  @Get(':id/join-requests/pending')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members', 'id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { id } = request.params;
      const { page, limit } = request.query;
      return `organization:${id}:join-requests:pending:${page || 1}:${limit || 10}`;
    },
    ttl: 60, // 1 minute - pending requests should be fresh
    tags: ['organizations', 'members'],
  })
  @ApiOperation({
    summary: 'Get pending join requests for an organization (Admin only)',
    description:
      'Returns all pending join requests for an organization. Requires manage_members permission.',
  })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending join requests retrieved',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async getPendingJoinRequests(
    @Param('id') organizationId: string,
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(
      `Get pending join requests for organization: ${organizationId}`,
    );
    return this.organizationsService.getPendingJoinRequests(
      organizationId,
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Patch('join-requests/:requestId/review')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members')
  @InvalidateCache(['organizations', 'members'])
  @ApiOperation({
    summary: 'Review a join request (Admin only)',
    description:
      'Approve or reject a pending join request. Requires manage_members permission.',
  })
  @ApiParam({ name: 'requestId', description: 'Join Request ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['APPROVED', 'REJECTED'],
        },
        rejectionReason: {
          type: 'string',
          description: 'Required when status is REJECTED',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Join request reviewed successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Join request not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request already reviewed or invalid status',
  })
  async reviewJoinRequest(
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string },
  ) {
    this.logger.log(`Review join request endpoint called: ${requestId}`);

    if (body.status === 'REJECTED' && !body.rejectionReason) {
      throw new BadRequestException(
        'Rejection reason is required when rejecting a request',
      );
    }

    return this.organizationsService.reviewJoinRequest(
      requestId,
      req.user.id,
      body.status,
      body.rejectionReason,
    );
  }

  @Get('my/join-requests')
  @ApiOperation({
    summary: "Get current user's join requests",
    description: 'Returns all join requests made by the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User join requests retrieved',
  })
  async getUserJoinRequests(@Request() req: any) {
    this.logger.log(`Get user join requests for: ${req.user.id}`);
    return this.organizationsService.getUserJoinRequests(req.user.id);
  }

  @Delete('join-requests/:requestId')
  @ApiOperation({
    summary: 'Cancel a join request',
    description:
      'Cancel a pending join request. Only the request owner can cancel.',
  })
  @ApiParam({ name: 'requestId', description: 'Join Request ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Join request cancelled successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only cancel your own join requests',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request is already processed',
  })
  async cancelJoinRequest(
    @Param('requestId') requestId: string,
    @Request() req: any,
  ) {
    this.logger.log(`Cancel join request endpoint called: ${requestId}`);
    return this.organizationsService.cancelJoinRequest(req.user.id, requestId);
  }

  @Get(':id/join-requests/stats')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage_members', 'id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `organization:${request.params.id}:join-requests:stats`;
    },
    ttl: 300, // 5 minutes
    tags: ['organizations', 'members', 'stats'],
  })
  @ApiOperation({
    summary: 'Get join request statistics for an organization (Admin only)',
    description:
      'Returns counts of pending, approved, and rejected join requests',
  })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Join request statistics retrieved',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async getOrganizationJoinRequestStats(
    @Param('id') organizationId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Get join request stats for organization: ${organizationId}`,
    );
    return this.organizationsService.getOrganizationJoinRequestStats(
      organizationId,
      req.user.id,
    );
  }

  // ============================================
  // ORGANIZATION STATISTICS
  // ============================================

  @Get('stats')
  @UseGuards(AdminGuard)
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `organizations:stats:${request.query.institutionId || 'all'}`;
    },
    ttl: 900, // 15 minutes
    tags: ['organizations', 'stats'],
  })
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

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('organization:manage')
  @InvalidateCache(['organizations', 'members', 'stats'])
  @ApiOperation({
    summary: 'Invalidate organizations cache (Admin only)',
    description: 'Clear all organizations-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Specific organization to invalidate (optional)',
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
    description: 'Organizations cache invalidated',
  })
  async invalidateOrganizationsCache(
    @Body() body: { organizationId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate organizations cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.organizationsService.invalidateOrganizationsCache(
      body.organizationId,
    );

    return {
      message: 'Organizations cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      organizationId: body.organizationId || 'all organizations',
    };
  }
}
