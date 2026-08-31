// src/v1/students/students.controller.ts
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
import { StudentsService } from './students.service';
import { PromotionService } from './promotion.service'; // Add this import
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequireAdminType,
  RequirePermission,
} from '../../common/guards/admin.guard';
import {
  CreateStudentDto,
  UpdateStudentDto,
  AddAcademicRecordDto,
  StudentResponseDto,
  StudentListResponseDto,
} from './dto';
import { PromoteInstitutionDto } from './dto/promotion.dto';
// Import cache decorators
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class StudentsController {
  private readonly logger = new Logger(StudentsController.name);

  constructor(
    private readonly studentsService: StudentsService,
    private readonly promotionService: PromotionService, // Add this
  ) {}

  // ============================================
  // STUDENT CRUD ENDPOINTS
  // ============================================

  @Post()
  @UseGuards(AdminGuard)
  @RequirePermission('student:create')
  @InvalidateCache(['students', 'dashboard', 'admin'])
  @ApiOperation({ summary: 'Create a new student (Admin only)' })
  @ApiBody({ type: CreateStudentDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Student created successfully',
    type: StudentResponseDto,
  })
  async createStudent(@Request() req: any, @Body() dto: CreateStudentDto) {
    this.logger.log('Create student endpoint called');
    return this.studentsService.createStudent(req.user.id, dto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @RequirePermission('student:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const {
        page,
        limit,
        institutionId,
        facultyId,
        departmentId,
        levelId,
        status,
        verificationStatus,
        search,
      } = request.query;
      return `students:${page || 1}:${limit || 10}:${institutionId || 'all'}:${facultyId || 'all'}:${departmentId || 'all'}:${levelId || 'all'}:${status || 'all'}:${verificationStatus || 'all'}:${search || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students'],
  })
  @ApiOperation({ summary: 'Get all students (Admin only)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'institutionId',
    required: false,
    description: 'Filter by institution',
  })
  @ApiQuery({
    name: 'facultyId',
    required: false,
    description: 'Filter by faculty',
  })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    description: 'Filter by department',
  })
  @ApiQuery({
    name: 'levelId',
    required: false,
    description: 'Filter by academic level',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'],
  })
  @ApiQuery({
    name: 'verificationStatus',
    required: false,
    enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, email, username, or matric number',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Students retrieved',
    type: StudentListResponseDto,
  })
  async getAllStudents(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('institutionId') institutionId?: string,
    @Query('facultyId') facultyId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('levelId') levelId?: string,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log('Get all students endpoint called');
    return this.studentsService.getAllStudents(
      parseInt(page, 10),
      parseInt(limit, 10),
      {
        institutionId,
        facultyId,
        departmentId,
        levelId,
        status,
        verificationStatus,
        search,
      },
    );
  }

  @Get('me')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:user:${request.user.id}`;
    },
    ttl: 120, // 2 minutes
    tags: ['students', 'user'],
  })
  @ApiOperation({ summary: 'Get current student profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student profile retrieved',
    type: StudentResponseDto,
  })
  async getCurrentStudent(@Request() req: any) {
    this.logger.log('Get current student endpoint called');
    return this.studentsService.getStudentByUserId(req.user.id);
  }

  @Get('dashboard')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:dashboard:${request.user.id}`;
    },
    ttl: 120, // 2 minutes
    tags: ['students', 'dashboard'],
  })
  @ApiOperation({ summary: 'Get student dashboard' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student dashboard retrieved',
  })
  async getStudentDashboard(@Request() req: any) {
    this.logger.log('Get student dashboard endpoint called');
    return this.studentsService.getStudentDashboard(req.user.id);
  }

  @Get('admin-dashboard')
  @UseGuards(AdminGuard)
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `students:admin-dashboard:${request.query.institutionId || 'all'}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students', 'admin', 'dashboard'],
  })
  @ApiOperation({ summary: 'Get admin student dashboard (Admin only)' })
  @ApiQuery({
    name: 'institutionId',
    required: false,
    description: 'Filter by institution',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin dashboard retrieved',
  })
  async getAdminDashboard(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get admin dashboard endpoint called');
    return this.studentsService.getAdminDashboard(institutionId);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @RequirePermission('student:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students'],
  })
  @ApiOperation({ summary: 'Get student by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student retrieved',
    type: StudentResponseDto,
  })
  async getStudentById(@Param('id') id: string) {
    this.logger.log(`Get student by ID endpoint called: ${id}`);
    return this.studentsService.getStudentById(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @RequirePermission('student:update', 'id')
  @InvalidateCache(['students', 'dashboard'])
  @ApiOperation({ summary: 'Update student (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: UpdateStudentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student updated',
    type: StudentResponseDto,
  })
  async updateStudent(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateStudentDto,
  ) {
    this.logger.log(`Update student endpoint called: ${id}`);
    return this.studentsService.updateStudent(id, req.user.id, dto);
  }

  // ============================================
  // ACADEMIC RECORDS
  // ============================================

  @Post(':id/academic-records')
  @UseGuards(AdminGuard)
  @RequirePermission('academic:manage', 'id')
  @InvalidateCache(['students', 'academics'])
  @ApiOperation({ summary: 'Add academic record (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: AddAcademicRecordDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Academic record added',
  })
  async addAcademicRecord(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: AddAcademicRecordDto,
  ) {
    this.logger.log(`Add academic record endpoint called for student: ${id}`);
    return this.studentsService.addAcademicRecord(id, req.user.id, dto);
  }

  @Get(':id/academic-records')
  @UseGuards(AdminGuard)
  @RequirePermission('academic:read', 'id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:academic-records:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students', 'academics'],
  })
  @ApiOperation({ summary: 'Get student academic records (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Academic records retrieved',
  })
  async getAcademicRecords(@Param('id') id: string) {
    this.logger.log(`Get academic records endpoint called for student: ${id}`);
    return this.studentsService.getAcademicRecords(id);
  }

  // ============================================
  // STUDENT PROMOTION
  // ============================================

  @Post('institutions/:institutionId/promote')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN', 'INSTITUTION_ADMIN')
  @RequirePermission('student:promote', 'institutionId')
  @InvalidateCache(['students', 'academics', 'promotions', 'sessions', 'auth'])
  @ApiOperation({
    summary: 'Promote every eligible student in an institution',
    description:
      'Advances the institution to its next academic session, creates that session when necessary, promotes students to the next level, and graduates final-level students. Existing organisation admins retain access only to their assigned session.',
  })
  @ApiParam({ name: 'institutionId', description: 'Institution ID' })
  @ApiBody({ type: PromoteInstitutionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institution promotion completed',
  })
  async promoteInstitution(
    @Param('institutionId') institutionId: string,
    @Request() req: any,
    @Body() dto: PromoteInstitutionDto,
  ) {
    return this.promotionService.promoteInstitution(
      institutionId,
      req.user.id,
      dto,
    );
  }

  @Get(':id/promotions')
  @UseGuards(AdminGuard)
  @RequirePermission('student:read', 'id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:promotions:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students', 'promotions'],
  })
  @ApiOperation({ summary: 'Get student promotion history (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Promotion history retrieved',
  })
  async getPromotionHistory(@Param('id') id: string) {
    this.logger.log(`Get promotion history endpoint called for student: ${id}`);
    return this.promotionService.getPromotionHistory(id, 1, 10);
  }

  @Get('promotions/eligible')
  @UseGuards(AdminGuard)
  @RequirePermission('student:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { fromLevelId, departmentId, page, limit } = request.query;
      return `students:eligible:${fromLevelId}:${departmentId || 'all'}:${page || 1}:${limit || 10}`;
    },
    ttl: 300,
    tags: ['students', 'promotions'],
  })
  @ApiOperation({ summary: 'Get eligible students for promotion (Admin only)' })
  @ApiQuery({ name: 'fromLevelId', required: true })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Eligible students retrieved',
  })
  async getEligibleStudents(
    @Query('fromLevelId') fromLevelId: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log('Get eligible students endpoint called');
    return this.promotionService.getEligibleStudents(
      fromLevelId,
      departmentId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('promotions/stats')
  @UseGuards(AdminGuard)
  @RequirePermission('analytics:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `promotions:stats:${request.query.institutionId || 'all'}`;
    },
    ttl: 600,
    tags: ['students', 'promotions', 'stats'],
  })
  @ApiOperation({ summary: 'Get promotion statistics (Admin only)' })
  @ApiQuery({ name: 'institutionId', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Promotion statistics retrieved',
  })
  async getPromotionStats(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get promotion stats endpoint called');
    return this.promotionService.getPromotionStats(institutionId);
  }

  // ============================================
  // STUDENT VERIFICATION
  // ============================================

  @Post(':id/verification/request')
  @RequirePermission('student:update', 'id')
  @InvalidateCache(['students', 'verifications'])
  @ApiOperation({ summary: 'Request verification' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentUrl: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verification requested',
  })
  async requestVerification(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { documentUrl?: string },
  ) {
    this.logger.log(`Request verification endpoint called for student: ${id}`);
    return this.studentsService.requestVerification(
      id,
      req.user.id,
      body.documentUrl,
    );
  }

  @Post('verification/:verificationId/verify')
  @UseGuards(AdminGuard)
  @RequirePermission('student:verify')
  @InvalidateCache(['students', 'verifications'])
  @ApiOperation({ summary: 'Verify student (Admin only)' })
  @ApiParam({ name: 'verificationId', description: 'Verification ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
        notes: { type: 'string', nullable: true },
      },
      required: ['status'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student verified',
  })
  async verifyStudent(
    @Param('verificationId') verificationId: string,
    @Request() req: any,
    @Body() body: { status: string; notes?: string },
  ) {
    this.logger.log(`Verify student endpoint called: ${verificationId}`);
    return this.studentsService.verifyStudent(
      verificationId,
      req.user.id,
      body.status,
      body.notes,
    );
  }

  @Get(':id/verifications')
  @UseGuards(AdminGuard)
  @RequirePermission('student:read', 'id')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `student:verifications:${request.params.id}`;
    },
    ttl: 300, // 5 minutes
    tags: ['students', 'verifications'],
  })
  @ApiOperation({ summary: 'Get student verifications (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verifications retrieved',
  })
  async getVerifications(@Param('id') id: string) {
    this.logger.log(`Get verifications endpoint called for student: ${id}`);
    return this.studentsService.getStudentVerifications(id);
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('student:manage')
  @InvalidateCache([
    'students',
    'dashboard',
    'admin',
    'academics',
    'promotions',
    'verifications',
  ])
  @ApiOperation({
    summary: 'Invalidate students cache (Admin only)',
    description: 'Clear all students-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        studentId: {
          type: 'string',
          description: 'Specific student to invalidate (optional)',
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
    description: 'Students cache invalidated',
  })
  async invalidateStudentsCache(
    @Body() body: { studentId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate students cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.studentsService.invalidateStudentsCache(body.studentId);

    return {
      message: 'Students cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      studentId: body.studentId || 'all students',
    };
  }
}
