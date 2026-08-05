// src/v1/governance/governance.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
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
import { GovernanceService } from './governance.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import {
  CreateElectionDto,
  UpdateElectionDto,
  NominateCandidateDto,
  CastVoteDto,
  CreateCommitteeDto,
  CreateExecutiveTermDto,
} from './dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('governance')
@Controller('governance')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class GovernanceController {
  private readonly logger = new Logger(GovernanceController.name);

  constructor(private readonly governanceService: GovernanceService) {}

  // ============================================
  // ELECTION ENDPOINTS
  // ============================================

  @Post('elections')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:election:create')
  @InvalidateCache(['governance', 'elections', 'stats'])
  @ApiOperation({ summary: 'Create election (Admin only)' })
  @ApiBody({ type: CreateElectionDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Election created',
  })
  async createElection(@Request() req: any, @Body() dto: CreateElectionDto) {
    this.logger.log('Create election endpoint called');
    return this.governanceService.createElection(req.user.id, dto);
  }

  @Get('elections')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { organizationId, page, limit, status } = request.query;
      return `elections:${organizationId || 'all'}:${page || 1}:${limit || 10}:${status || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['governance', 'elections'],
  })
  @ApiOperation({ summary: 'Get elections' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'NOMINATION', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Elections retrieved',
  })
  async getElections(
    @Query('organizationId') organizationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
  ) {
    this.logger.log('Get elections endpoint called');
    return this.governanceService.getElections(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
      { status },
    );
  }

  @Get('elections/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `election:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['governance', 'elections'],
  })
  @ApiOperation({ summary: 'Get election by ID' })
  @ApiParam({ name: 'id', description: 'Election ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Election retrieved',
  })
  async getElectionById(@Param('id') id: string) {
    this.logger.log(`Get election by ID endpoint called: ${id}`);
    return this.governanceService.getElectionById(id);
  }

  @Get('elections/:id/results')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `election:results:${request.params.id}`;
    },
    ttl: 600, // 10 minutes
    tags: ['governance', 'elections', 'results'],
  })
  @ApiOperation({ summary: 'Get election results' })
  @ApiParam({ name: 'id', description: 'Election ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Election results retrieved',
  })
  async getElectionResults(@Param('id') id: string) {
    this.logger.log(`Get election results endpoint called: ${id}`);
    return this.governanceService.getElectionResults(id);
  }

  @Patch('elections/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:election:manage')
  @InvalidateCache(['governance', 'elections', 'stats'])
  @ApiOperation({ summary: 'Update election (Admin only)' })
  @ApiParam({ name: 'id', description: 'Election ID' })
  @ApiBody({ type: UpdateElectionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Election updated',
  })
  async updateElection(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateElectionDto,
  ) {
    this.logger.log(`Update election endpoint called: ${id}`);
    return this.governanceService.updateElection(id, req.user.id, dto);
  }

  @Post('elections/:id/start')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:election:manage')
  @InvalidateCache(['governance', 'elections', 'stats'])
  @ApiOperation({ summary: 'Start election (Admin only)' })
  @ApiParam({ name: 'id', description: 'Election ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Election started',
  })
  async startElection(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Start election endpoint called: ${id}`);
    return this.governanceService.startElection(id, req.user.id);
  }

  @Post('elections/:id/end')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:election:manage')
  @InvalidateCache(['governance', 'elections', 'stats', 'results'])
  @ApiOperation({ summary: 'End election (Admin only)' })
  @ApiParam({ name: 'id', description: 'Election ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Election ended',
  })
  async endElection(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`End election endpoint called: ${id}`);
    return this.governanceService.endElection(id, req.user.id);
  }

  // ============================================
  // CANDIDATE ENDPOINTS
  // ============================================

  @Post('elections/nominate')
  @RequirePermission('governance:election:nominate')
  @InvalidateCache(['governance', 'elections', 'candidates'])
  @ApiOperation({ summary: 'Nominate candidate' })
  @ApiBody({ type: NominateCandidateDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Candidate nominated',
  })
  async nominateCandidate(
    @Request() req: any,
    @Body() dto: NominateCandidateDto,
  ) {
    this.logger.log('Nominate candidate endpoint called');
    return this.governanceService.nominateCandidate(req.user.id, dto);
  }

  @Post('elections/candidates/:id/approve')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:election:manage')
  @InvalidateCache(['governance', 'elections', 'candidates'])
  @ApiOperation({ summary: 'Approve candidate (Admin only)' })
  @ApiParam({ name: 'id', description: 'Candidate ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Candidate approved',
  })
  async approveCandidate(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Approve candidate endpoint called: ${id}`);
    return this.governanceService.approveCandidate(id, req.user.id);
  }

  // ============================================
  // VOTING ENDPOINTS - NO CACHE (Write operation)
  // ============================================

  @Post('elections/vote')
  @RequirePermission('governance:election:vote')
  @InvalidateCache(['governance', 'elections', 'votes', 'results'])
  @ApiOperation({ summary: 'Cast vote' })
  @ApiBody({ type: CastVoteDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Vote cast',
  })
  async castVote(@Request() req: any, @Body() dto: CastVoteDto) {
    this.logger.log('Cast vote endpoint called');
    return this.governanceService.castVote(req.user.id, dto);
  }

  // ============================================
  // COMMITTEE ENDPOINTS
  // ============================================

  @Post('committees')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:create')
  @InvalidateCache(['governance', 'committees'])
  @ApiOperation({ summary: 'Create committee (Admin only)' })
  @ApiBody({ type: CreateCommitteeDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Committee created',
  })
  async createCommittee(@Request() req: any, @Body() dto: CreateCommitteeDto) {
    this.logger.log('Create committee endpoint called');
    return this.governanceService.createCommittee(req.user.id, dto);
  }

  @Get('committees')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { organizationId, page, limit } = request.query;
      return `committees:${organizationId || 'all'}:${page || 1}:${limit || 10}`;
    },
    ttl: 600, // 10 minutes
    tags: ['governance', 'committees'],
  })
  @ApiOperation({ summary: 'Get committees' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Committees retrieved',
  })
  async getCommittees(
    @Query('organizationId') organizationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log('Get committees endpoint called');
    return this.governanceService.getCommittees(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  // ============================================
  // EXECUTIVE TERM ENDPOINTS
  // ============================================

  @Post('executive-terms')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:create')
  @InvalidateCache(['governance', 'executive'])
  @ApiOperation({ summary: 'Create executive term (Admin only)' })
  @ApiBody({ type: CreateExecutiveTermDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Executive term created',
  })
  async createExecutiveTerm(
    @Request() req: any,
    @Body() dto: CreateExecutiveTermDto,
  ) {
    this.logger.log('Create executive term endpoint called');
    return this.governanceService.createExecutiveTerm(req.user.id, dto);
  }

  @Get('executive-terms')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { organizationId, page, limit } = request.query;
      return `executive:terms:${organizationId || 'all'}:${page || 1}:${limit || 10}`;
    },
    ttl: 600, // 10 minutes
    tags: ['governance', 'executive'],
  })
  @ApiOperation({ summary: 'Get executive terms' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Executive terms retrieved',
  })
  async getExecutiveTerms(
    @Query('organizationId') organizationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log('Get executive terms endpoint called');
    return this.governanceService.getExecutiveTerms(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  // ============================================
  // STATS ENDPOINT
  // ============================================

  @Get('stats')
  @UseGuards(AdminGuard)
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `governance:stats:${request.query.organizationId || 'all'}`;
    },
    ttl: 900, // 15 minutes
    tags: ['governance', 'stats'],
  })
  @ApiOperation({ summary: 'Get governance statistics (Admin only)' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Governance statistics retrieved',
  })
  async getStats(@Query('organizationId') organizationId?: string) {
    this.logger.log('Get governance stats endpoint called');
    return this.governanceService.getElectionStats(organizationId);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('governance:manage')
  @InvalidateCache([
    'governance',
    'elections',
    'committees',
    'executive',
    'stats',
    'results',
    'candidates',
    'votes',
  ])
  @ApiOperation({
    summary: 'Invalidate governance cache (Admin only)',
    description: 'Clear all governance-related cache.',
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
    description: 'Governance cache invalidated',
  })
  async invalidateGovernanceCache(
    @Body() body: { organizationId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate governance cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.governanceService.invalidateGovernanceCache(body.organizationId);

    return {
      message: 'Governance cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      organizationId: body.organizationId || 'all organizations',
    };
  }
}
