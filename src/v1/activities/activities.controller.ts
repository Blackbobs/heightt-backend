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
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  UpdateActivityDto,
  RegisterActivityDto,
} from './dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('activities')
@Controller('activities')
export class ActivitiesController {
  private readonly logger = new Logger(ActivitiesController.name);

  constructor(private readonly activitiesService: ActivitiesService) {}

  // ============================================
  // PUBLIC EVENTS (No authentication required)
  // ============================================

  @Get('public')
  @Cacheable(300, ['activities', 'public']) // Cache for 5 minutes with tags
  @ApiOperation({
    summary: 'Get all public activities',
    description:
      'Get all activities that are open to everyone. No authentication required.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description: 'Filter by organization',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by title, description, or location',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by start date (ISO)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (ISO)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Public activities retrieved',
  })
  async getPublicActivities(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('organizationId') organizationId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log('Get public activities endpoint called');
    return this.activitiesService.getPublicActivities(
      parseInt(page, 10),
      parseInt(limit, 10),
      { organizationId, search, startDate, endDate },
    );
  }

  // ============================================
  // ACTIVITY CRUD ENDPOINTS (Authenticated)
  // ============================================

  @Post()
  @UseGuards(JwtGuard)
  @InvalidateCache(['activities', 'public']) // Invalidate cache when creating new activity
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create activity',
    description:
      'Create a new activity. All activities are public and visible to everyone.',
  })
  @ApiBody({ type: CreateActivityDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Activity created',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'You do not have permission to create activities for this organization',
  })
  async createActivity(@Request() req: any, @Body() dto: CreateActivityDto) {
    this.logger.log('Create activity endpoint called');
    return this.activitiesService.createActivity(req.user.id, dto);
  }

  @Get()
  @UseGuards(JwtGuard)
  @Cacheable(300, ['activities']) // Cache for 5 minutes
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all activities (authenticated)',
    description:
      'Get all activities. Authenticated users can see all public activities.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
  })
  @ApiQuery({ name: 'isFree', required: false, enum: ['true', 'false'] })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by start date (ISO)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (ISO)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by title, description, or location',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activities retrieved',
  })
  async getActivities(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
    @Query('isFree') isFree?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log('Get activities endpoint called');
    return this.activitiesService.getActivities(
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
      {
        organizationId,
        status,
        isFree:
          isFree === 'true' ? true : isFree === 'false' ? false : undefined,
        startDate,
        endDate,
        search,
      },
    );
  }

  @Get(':id')
  @CacheKey((context) => {
    const request = context.switchToHttp().getRequest();
    const id = request.params.id;
    return `activity:${id}`;
  })
  @Cache({ ttl: 600, tags: ['activities', 'activity-detail'] }) // 10 minutes
  @ApiOperation({
    summary: 'Get activity by ID',
    description:
      'Get detailed information about a specific activity. No authentication required.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity retrieved',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Activity not found',
  })
  async getActivityById(@Param('id') id: string) {
    this.logger.log(`Get activity by ID endpoint called: ${id}`);
    return this.activitiesService.getActivityById(id);
  }

  @Patch(':id')
  @UseGuards(JwtGuard)
  @InvalidateCache(['activities', 'public', 'activity-detail'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update activity',
    description:
      'Update an activity. Users can update their own events. Admins can update any.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity updated',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You do not have permission to update this activity',
  })
  async updateActivity(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateActivityDto,
  ) {
    this.logger.log(`Update activity endpoint called: ${id}`);
    return this.activitiesService.updateActivity(id, req.user.id, dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtGuard)
  @InvalidateCache(['activities', 'public', 'activity-detail'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Publish activity',
    description:
      'Publish an activity. Users can publish their own events. Admins can publish any.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity published',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You do not have permission to publish this activity',
  })
  async publishActivity(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Publish activity endpoint called: ${id}`);
    return this.activitiesService.publishActivity(id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  @InvalidateCache(['activities', 'public', 'activity-detail'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete activity',
    description: 'Users can delete their own events. Admins can delete any.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity deleted',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You do not have permission to delete this activity',
  })
  async deleteActivity(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete activity endpoint called: ${id}`);
    return this.activitiesService.deleteActivity(id, req.user.id);
  }

  // ============================================
  // REGISTRATION ENDPOINTS
  // ============================================

  @Post(':id/register')
  @UseGuards(JwtGuard)
  @InvalidateCache(['activities', 'registrations'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register for activity',
    description:
      'Register a user for an activity. Users can register for any public activity.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiBody({ type: RegisterActivityDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Registration successful',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Activity is at full capacity or already started',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'You are already registered for this activity',
  })
  async registerForActivity(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: RegisterActivityDto,
  ) {
    this.logger.log(`Register for activity endpoint called: ${id}`);
    return this.activitiesService.registerForActivity(req.user.id, id, dto);
  }

  @Post('registrations/:id/confirm')
  @UseGuards(AdminGuard)
  @RequirePermission('event:manage')
  @InvalidateCache(['registrations'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Confirm registration (Admin only)',
    description: 'Confirm a pending registration. Only admins can do this.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Registration confirmed',
  })
  async confirmRegistration(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Confirm registration endpoint called: ${id}`);
    return this.activitiesService.confirmRegistration(id, req.user.id);
  }

  @Post('registrations/:id/cancel')
  @UseGuards(JwtGuard)
  @InvalidateCache(['registrations'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cancel registration',
    description:
      'Cancel a registration. Users can cancel their own registrations. Admins can cancel any.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Registration cancelled',
  })
  async cancelRegistration(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Cancel registration endpoint called: ${id}`);
    return this.activitiesService.cancelRegistration(id, req.user.id);
  }

  // ============================================
  // ATTENDANCE ENDPOINTS
  // ============================================

  @Post('registrations/:id/check-in')
  @UseGuards(AdminGuard)
  @RequirePermission('event:manage')
  @InvalidateCache(['attendance', 'activity-stats'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Check-in attendee (Admin only)',
    description: 'Check-in an attendee. Only admins can do this.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attendee checked in',
  })
  async checkInAttendee(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Check-in attendee endpoint called: ${id}`);
    return this.activitiesService.checkInAttendee(id, req.user.id);
  }

  @Post('attendance/:id/check-out')
  @UseGuards(AdminGuard)
  @RequirePermission('event:manage')
  @InvalidateCache(['attendance', 'activity-stats'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Check-out attendee (Admin only)',
    description: 'Check-out an attendee. Only admins can do this.',
  })
  @ApiParam({ name: 'id', description: 'Attendance ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attendee checked out',
  })
  async checkOutAttendee(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Check-out attendee endpoint called: ${id}`);
    return this.activitiesService.checkOutAttendee(id, req.user.id);
  }

  // ============================================
  // STATS AND DASHBOARD ENDPOINTS
  // ============================================

  @Get(':id/stats')
  @UseGuards(AdminGuard)
  @RequirePermission('event:read')
  @Cacheable(120, ['activity-stats']) // Cache for 2 minutes
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get activity statistics (Admin only)',
    description:
      'Get detailed statistics for an activity. Only admins can do this.',
  })
  @ApiParam({ name: 'id', description: 'Activity ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity statistics retrieved',
  })
  async getActivityStats(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Get activity stats endpoint called: ${id}`);
    return this.activitiesService.getActivityStats(id, req.user.id);
  }

  @Get('organizations/:organizationId/dashboard')
  @UseGuards(AdminGuard)
  @RequirePermission('event:read')
  @Cacheable(180, ['organization-dashboard', 'activities'])
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get organization activity dashboard (Admin only)',
    description:
      'Get a dashboard of all activities for an organization. Only admins can do this.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization activity dashboard retrieved',
  })
  async getOrganizationActivityDashboard(
    @Param('organizationId') organizationId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Get organization activity dashboard endpoint called: ${organizationId}`,
    );
    return this.activitiesService.getOrganizationActivityDashboard(
      organizationId,
      req.user.id,
    );
  }
}
