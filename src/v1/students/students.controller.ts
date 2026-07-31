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
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import {
  CreateStudentDto,
  UpdateStudentDto,
  AddAcademicRecordDto,
  PromoteStudentDto,
  StudentResponseDto,
  StudentListResponseDto,
} from './dto';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class StudentsController {
  private readonly logger = new Logger(StudentsController.name);

  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @UseGuards(AdminGuard)
  @RequirePermission('student:create')
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

  @Post(':id/academic-records')
  @UseGuards(AdminGuard)
  @RequirePermission('academic:manage', 'id')
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

  @Post(':id/promote')
  @UseGuards(AdminGuard)
  @RequirePermission('student:promote', 'id')
  @ApiOperation({ summary: 'Promote student (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: PromoteStudentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student promoted',
  })
  async promoteStudent(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: PromoteStudentDto,
  ) {
    this.logger.log(`Promote student endpoint called for student: ${id}`);
    return this.studentsService.promoteStudent(id, req.user.id, dto);
  }

  @Get(':id/promotions')
  @UseGuards(AdminGuard)
  @RequirePermission('student:read', 'id')
  @ApiOperation({ summary: 'Get student promotion history (Admin only)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Promotion history retrieved',
  })
  async getPromotionHistory(@Param('id') id: string) {
    this.logger.log(`Get promotion history endpoint called for student: ${id}`);
    return this.studentsService.getPromotionHistory(id);
  }

  @Post(':id/verification/request')
  @RequirePermission('student:update', 'id')
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
}
