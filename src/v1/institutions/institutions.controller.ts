// src/v1/institutions/institutions.controller.ts

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
import { InstitutionsService } from './institutions.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../../common/guards/admin.guard';
import {
  CreateInstitutionDto,
  UpdateInstitutionDto,
  CreateFacultyDto,
  UpdateFacultyDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateAcademicLevelDto,
  CreateAcademicSessionDto,
  InstitutionResponseDto,
  InstitutionListResponseDto,
} from './dto';
import {
  Cache,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('institutions')
@Controller('institutions')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class InstitutionsController {
  private readonly logger = new Logger(InstitutionsController.name);

  constructor(private readonly institutionsService: InstitutionsService) {}

  // ============================================
  // INSTITUTION ENDPOINTS
  // ============================================

  @Post()
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('institution:create')
  @InvalidateCache(['institutions'])
  @ApiOperation({ summary: 'Create a new institution (Platform Admin only)' })
  @ApiBody({ type: CreateInstitutionDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Institution created successfully',
    type: InstitutionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'At least one academic session is required',
  })
  async createInstitution(
    @Request() req: any,
    @Body() dto: CreateInstitutionDto,
  ) {
    this.logger.log(`Create institution endpoint called`);
    return this.institutionsService.createInstitution(req.user.id, dto);
  }

  @Get()
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { page, limit, status, search } = request.query;
      return `institutions:${page || 1}:${limit || 10}:${status || 'all'}:${search || 'all'}`;
    },
    ttl: 600,
    tags: ['institutions'],
  })
  @ApiOperation({ summary: 'Get all institutions (Public)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, code, or shortName',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institutions retrieved',
    type: InstitutionListResponseDto,
  })
  async getAllInstitutions(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log('Get all institutions endpoint called');
    return this.institutionsService.getAllInstitutions(
      parseInt(page, 10),
      parseInt(limit, 10),
      { status, search },
    );
  }

  @Get(':id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `institution:${request.params.id}`;
    },
    ttl: 600,
    tags: ['institutions'],
  })
  @ApiOperation({ summary: 'Get institution by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Institution ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institution retrieved',
    type: InstitutionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institution not found',
  })
  async getInstitutionById(@Param('id') id: string) {
    this.logger.log(`Get institution by ID endpoint called: ${id}`);
    return this.institutionsService.getInstitutionById(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @RequirePermission('institution:update')
  @InvalidateCache(['institutions'])
  @ApiOperation({ summary: 'Update institution (Admin only)' })
  @ApiParam({ name: 'id', description: 'Institution ID' })
  @ApiBody({ type: UpdateInstitutionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institution updated',
    type: InstitutionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateInstitution(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateInstitutionDto,
  ) {
    this.logger.log(`Update institution endpoint called: ${id}`);
    return this.institutionsService.updateInstitution(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('institution:delete')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['institutions'])
  @ApiOperation({ summary: 'Delete institution (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Institution ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Institution deleted' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async deleteInstitution(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete institution endpoint called: ${id}`);
    return this.institutionsService.deleteInstitution(id, req.user.id);
  }

  @Get(':id/stats')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `institution:stats:${request.params.id}`;
    },
    ttl: 900,
    tags: ['institutions', 'stats'],
  })
  @ApiOperation({ summary: 'Get institution statistics' })
  @ApiParam({ name: 'id', description: 'Institution ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institution statistics retrieved',
  })
  async getInstitutionStats(@Param('id') id: string) {
    this.logger.log(`Get institution stats endpoint called: ${id}`);
    return this.institutionsService.getInstitutionStats(id);
  }

  // ============================================
  // FACULTY ENDPOINTS
  // ============================================

  @Post('faculties')
  @UseGuards(AdminGuard)
  @RequirePermission('faculty:create')
  @InvalidateCache(['institutions', 'faculties'])
  @ApiOperation({ summary: 'Create a new faculty (Admin only)' })
  @ApiBody({ type: CreateFacultyDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Faculty created successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async createFaculty(@Request() req: any, @Body() dto: CreateFacultyDto) {
    this.logger.log(`Create faculty endpoint called`);
    return this.institutionsService.createFaculty(req.user.id, dto);
  }

  @Get(':institutionId/faculties')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `faculties:institution:${request.params.institutionId}`;
    },
    ttl: 600,
    tags: ['institutions', 'faculties'],
  })
  @ApiOperation({ summary: 'Get all faculties by institution (Public)' })
  @ApiParam({ name: 'institutionId', description: 'Institution ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Faculties retrieved' })
  async getFacultiesByInstitution(
    @Param('institutionId') institutionId: string,
  ) {
    this.logger.log(
      `Get faculties by institution endpoint called: ${institutionId}`,
    );
    return this.institutionsService.getFacultiesByInstitution(institutionId);
  }

  @Get('faculties/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `faculty:${request.params.id}`;
    },
    ttl: 600,
    tags: ['institutions', 'faculties'],
  })
  @ApiOperation({ summary: 'Get faculty by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Faculty ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Faculty retrieved' })
  async getFacultyById(@Param('id') id: string) {
    this.logger.log(`Get faculty by ID endpoint called: ${id}`);
    return this.institutionsService.getFacultyById(id);
  }

  @Patch('faculties/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('faculty:update')
  @InvalidateCache(['institutions', 'faculties'])
  @ApiOperation({ summary: 'Update faculty (Admin only)' })
  @ApiParam({ name: 'id', description: 'Faculty ID' })
  @ApiBody({ type: UpdateFacultyDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Faculty updated' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateFaculty(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateFacultyDto,
  ) {
    this.logger.log(`Update faculty endpoint called: ${id}`);
    return this.institutionsService.updateFaculty(id, req.user.id, dto);
  }

  @Delete('faculties/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('faculty:delete')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['institutions', 'faculties'])
  @ApiOperation({ summary: 'Delete faculty (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Faculty ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Faculty deleted' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async deleteFaculty(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete faculty endpoint called: ${id}`);
    return this.institutionsService.deleteFaculty(id, req.user.id);
  }

  // ============================================
  // DEPARTMENT ENDPOINTS
  // ============================================

  @Post('departments')
  @UseGuards(AdminGuard)
  @RequirePermission('department:create')
  @InvalidateCache(['institutions', 'departments'])
  @ApiOperation({ summary: 'Create a new department (Admin only)' })
  @ApiBody({ type: CreateDepartmentDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Department created successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async createDepartment(
    @Request() req: any,
    @Body() dto: CreateDepartmentDto,
  ) {
    this.logger.log(`Create department endpoint called`);
    return this.institutionsService.createDepartment(req.user.id, dto);
  }

  @Get('faculties/:facultyId/departments')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `departments:faculty:${request.params.facultyId}`;
    },
    ttl: 600,
    tags: ['institutions', 'departments'],
  })
  @ApiOperation({ summary: 'Get all departments by faculty (Public)' })
  @ApiParam({ name: 'facultyId', description: 'Faculty ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Departments retrieved' })
  async getDepartmentsByFaculty(@Param('facultyId') facultyId: string) {
    this.logger.log(`Get departments by faculty endpoint called: ${facultyId}`);
    return this.institutionsService.getDepartmentsByFaculty(facultyId);
  }

  @Get('departments/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `department:${request.params.id}`;
    },
    ttl: 600,
    tags: ['institutions', 'departments'],
  })
  @ApiOperation({ summary: 'Get department by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department retrieved' })
  async getDepartmentById(@Param('id') id: string) {
    this.logger.log(`Get department by ID endpoint called: ${id}`);
    return this.institutionsService.getDepartmentById(id);
  }

  @Patch('departments/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('department:update')
  @InvalidateCache(['institutions', 'departments'])
  @ApiOperation({ summary: 'Update department (Admin only)' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiBody({ type: UpdateDepartmentDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department updated' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateDepartment(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateDepartmentDto,
  ) {
    this.logger.log(`Update department endpoint called: ${id}`);
    return this.institutionsService.updateDepartment(id, req.user.id, dto);
  }

  @Delete('departments/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('department:delete')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['institutions', 'departments'])
  @ApiOperation({ summary: 'Delete department (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department deleted' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async deleteDepartment(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete department endpoint called: ${id}`);
    return this.institutionsService.deleteDepartment(id, req.user.id);
  }

  // ============================================
  // ACADEMIC LEVEL ENDPOINTS
  // ============================================

  @Post('academic-levels')
  @UseGuards(AdminGuard)
  @RequirePermission('academic_level:create')
  @InvalidateCache(['institutions', 'academic-levels'])
  @ApiOperation({ summary: 'Create a new academic level (Admin only)' })
  @ApiBody({ type: CreateAcademicLevelDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Academic level created successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async createAcademicLevel(
    @Request() req: any,
    @Body() dto: CreateAcademicLevelDto,
  ) {
    this.logger.log(`Create academic level endpoint called`);
    return this.institutionsService.createAcademicLevel(req.user.id, dto);
  }

  @Get('departments/:departmentId/academic-levels')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `academic-levels:department:${request.params.departmentId}`;
    },
    ttl: 600,
    tags: ['institutions', 'academic-levels'],
  })
  @ApiOperation({ summary: 'Get all academic levels by department (Public)' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic levels retrieved',
  })
  async getAcademicLevelsByDepartment(
    @Param('departmentId') departmentId: string,
  ) {
    this.logger.log(
      `Get academic levels by department endpoint called: ${departmentId}`,
    );
    return this.institutionsService.getAcademicLevelsByDepartment(departmentId);
  }

  @Get('academic-levels/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `academic-level:${request.params.id}`;
    },
    ttl: 600,
    tags: ['institutions', 'academic-levels'],
  })
  @ApiOperation({ summary: 'Get academic level by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Academic level ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic level retrieved',
  })
  async getAcademicLevelById(@Param('id') id: string) {
    this.logger.log(`Get academic level by ID endpoint called: ${id}`);
    return this.institutionsService.getAcademicLevelById(id);
  }

  @Delete('academic-levels/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('academic_level:delete')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['institutions', 'academic-levels'])
  @ApiOperation({ summary: 'Delete academic level (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Academic level ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Academic level deleted' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async deleteAcademicLevel(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete academic level endpoint called: ${id}`);
    return this.institutionsService.deleteAcademicLevel(id, req.user.id);
  }

  // ============================================
  // ACADEMIC SESSION ENDPOINTS
  // ============================================

  @Post('academic-sessions')
  @UseGuards(AdminGuard)
  @RequirePermission('academic_session:create')
  @InvalidateCache(['institutions', 'sessions'])
  @ApiOperation({ summary: 'Create a new academic session (Admin only)' })
  @ApiBody({ type: CreateAcademicSessionDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Academic session created successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Session already exists for this institution',
  })
  async createAcademicSession(
    @Request() req: any,
    @Body() dto: CreateAcademicSessionDto,
  ) {
    this.logger.log(`Create academic session endpoint called`);
    return this.institutionsService.createAcademicSession(req.user.id, dto);
  }

  @Get(':institutionId/academic-sessions')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `sessions:institution:${request.params.institutionId}`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions'],
  })
  @ApiOperation({
    summary: 'Get all academic sessions by institution (Public)',
  })
  @ApiParam({ name: 'institutionId', description: 'Institution ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic sessions retrieved',
  })
  async getSessionsByInstitution(
    @Param('institutionId') institutionId: string,
  ) {
    this.logger.log(
      `Get academic sessions by institution endpoint called: ${institutionId}`,
    );
    return this.institutionsService.getSessionsByInstitution(institutionId);
  }

  @Get('academic-sessions/:id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `session:${request.params.id}`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions'],
  })
  @ApiOperation({ summary: 'Get academic session by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic session retrieved',
  })
  async getAcademicSessionById(@Param('id') id: string) {
    this.logger.log(`Get academic session by ID endpoint called: ${id}`);
    return this.institutionsService.getAcademicSessionById(id);
  }

  @Get('academic-sessions/:id/stats')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `session:stats:${request.params.id}`;
    },
    ttl: 300,
    tags: ['institutions', 'sessions', 'stats'],
  })
  @ApiOperation({ summary: 'Get academic session statistics' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session statistics retrieved',
  })
  async getAcademicSessionStats(@Param('id') id: string) {
    this.logger.log(`Get academic session stats endpoint called: ${id}`);
    return this.institutionsService.getAcademicSessionStats(id);
  }

  @Get('academic-sessions/:id/students')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { id } = request.params;
      const { page, limit } = request.query;
      return `session:${id}:students:${page || 1}:${limit || 10}`;
    },
    ttl: 120,
    tags: ['institutions', 'sessions', 'students'],
  })
  @ApiOperation({ summary: 'Get students by academic session' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Students retrieved',
  })
  async getStudentsBySession(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(`Get students by session endpoint called: ${id}`);
    return this.institutionsService.getStudentsBySession(
      id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('academic-sessions/:id/organizations')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { id } = request.params;
      const { type, status } = request.query;
      return `session:${id}:organizations:${type || 'all'}:${status || 'all'}`;
    },
    ttl: 300,
    tags: ['institutions', 'sessions', 'organizations'],
  })
  @ApiOperation({ summary: 'Get organizations by academic session' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiQuery({ name: 'type', required: false, description: 'Organization type' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Organization status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organizations retrieved',
  })
  async getOrganizationsBySession(
    @Param('id') id: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    this.logger.log(`Get organizations by session endpoint called: ${id}`);
    return this.institutionsService.getOrganizationsBySession(id, type, status);
  }

  @Get('faculties/:facultyId/sessions')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `sessions:faculty:${request.params.facultyId}`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions', 'faculties'],
  })
  @ApiOperation({ summary: 'Get all faculty-level academic sessions (Public)' })
  @ApiParam({ name: 'facultyId', description: 'Faculty ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic sessions retrieved',
  })
  async getSessionsByFaculty(@Param('facultyId') facultyId: string) {
    this.logger.log(`Get sessions by faculty endpoint called: ${facultyId}`);
    return this.institutionsService.getSessionsByFaculty(facultyId);
  }

  @Get('departments/:departmentId/sessions')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `sessions:department:${request.params.departmentId}`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions', 'departments'],
  })
  @ApiOperation({
    summary: 'Get all department-level academic sessions (Public)',
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic sessions retrieved',
  })
  async getSessionsByDepartment(@Param('departmentId') departmentId: string) {
    this.logger.log(
      `Get sessions by department endpoint called: ${departmentId}`,
    );
    return this.institutionsService.getSessionsByDepartment(departmentId);
  }

  @Get('departments/:departmentId/sessions/with-levels')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `sessions:department:${request.params.departmentId}:with-levels`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions', 'departments', 'academic-levels'],
  })
  @ApiOperation({
    summary:
      'Get all sessions for a department including level-specific sessions (Public)',
    description:
      'Returns sessions at both department level and individual level sessions',
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Department sessions with levels retrieved',
  })
  async getDepartmentSessionsWithLevels(
    @Param('departmentId') departmentId: string,
  ) {
    this.logger.log(
      `Get department sessions with levels endpoint called: ${departmentId}`,
    );
    return this.institutionsService.getDepartmentSessionsWithLevels(
      departmentId,
    );
  }

  @Get('academic-levels/:levelId/sessions')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `sessions:level:${request.params.levelId}`;
    },
    ttl: 600,
    tags: ['institutions', 'sessions', 'academic-levels'],
  })
  @ApiOperation({
    summary: 'Get all level-specific academic sessions (Public)',
  })
  @ApiParam({ name: 'levelId', description: 'Academic Level ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic sessions retrieved',
  })
  async getSessionsByLevel(@Param('levelId') levelId: string) {
    this.logger.log(`Get sessions by level endpoint called: ${levelId}`);
    return this.institutionsService.getSessionsByLevel(levelId);
  }

  @Patch('academic-sessions/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('academic_session:update')
  @InvalidateCache(['institutions', 'sessions'])
  @ApiOperation({ summary: 'Update academic session (Admin only)' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiBody({ type: CreateAcademicSessionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic session updated',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateAcademicSession(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: CreateAcademicSessionDto,
  ) {
    this.logger.log(`Update academic session endpoint called: ${id}`);
    return this.institutionsService.updateAcademicSession(id, req.user.id, dto);
  }

  @Delete('academic-sessions/:id')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('academic_session:delete')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['institutions', 'sessions'])
  @ApiOperation({ summary: 'Delete academic session (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Academic session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic session deleted',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async deleteAcademicSession(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete academic session endpoint called: ${id}`);
    return this.institutionsService.deleteAcademicSession(id, req.user.id);
  }

  @Post(':departmentId/generate-organizations')
  @UseGuards(AdminGuard)
  @RequirePermission('department:update')
  @InvalidateCache(['institutions', 'organizations'])
  @ApiOperation({
    summary: 'Generate organizations for department academic levels',
    description:
      'Creates organizations for each academic level in a department',
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organizations generated successfully',
  })
  async generateOrganizationsForDepartment(
    @Param('departmentId') departmentId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Generate organizations for department endpoint called: ${departmentId}`,
    );
    return this.institutionsService.generateOrganizationsForDepartment(
      departmentId,
      req.user.id,
    );
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('institution:manage')
  @InvalidateCache([
    'institutions',
    'faculties',
    'departments',
    'academic-levels',
    'sessions',
  ])
  @ApiOperation({
    summary: 'Invalidate institutions cache (Admin only)',
    description: 'Clear all institutions-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        institutionId: {
          type: 'string',
          description: 'Specific institution to invalidate (optional)',
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
    description: 'Institutions cache invalidated',
  })
  async invalidateInstitutionsCache(
    @Body() body: { institutionId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate institutions cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.institutionsService.invalidateInstitutionsCache(
      body.institutionId,
    );

    return {
      message: 'Institutions cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      institutionId: body.institutionId || 'all institutions',
    };
  }
}