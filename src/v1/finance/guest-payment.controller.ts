import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { GuestPaymentService } from './guest-payment.service';
import {
  CreateGuestPaymentDto,
  GuestPaymentAccessDto,
  VerifyGuestClaimDto,
} from './dto';

@ApiTags('guest-payments')
@Controller('guest-payments')
export class GuestPaymentController {
  constructor(private readonly guestPayments: GuestPaymentService) {}

  @Get('options/institutions')
  @ApiOperation({ summary: 'List active institutions for guest payment' })
  institutions() {
    return this.guestPayments.listInstitutions();
  }

  @Get('options/faculties')
  @ApiQuery({ name: 'institutionId', required: true })
  faculties(@Query('institutionId') institutionId: string) {
    return this.guestPayments.listFaculties(institutionId);
  }

  @Get('options/departments')
  @ApiQuery({ name: 'facultyId', required: true })
  departments(@Query('facultyId') facultyId: string) {
    return this.guestPayments.listDepartments(facultyId);
  }

  @Get('options/academic-levels')
  @ApiQuery({ name: 'institutionId', required: true })
  @ApiQuery({ name: 'facultyId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  academicLevels(
    @Query('institutionId') institutionId: string,
    @Query('facultyId') facultyId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.guestPayments.listAcademicLevels({
      institutionId,
      facultyId,
      departmentId,
    });
  }

  @Get('options/dues')
  @ApiQuery({ name: 'institutionId', required: true })
  @ApiQuery({ name: 'facultyId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'academicLevelId', required: true })
  dues(
    @Query('institutionId') institutionId: string,
    @Query('facultyId') facultyId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('academicLevelId') academicLevelId?: string,
  ) {
    return this.guestPayments.listDues({
      institutionId,
      facultyId,
      departmentId,
      organizationId,
      academicLevelId,
    });
  }

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate a due payment without an account' })
  initiate(@Body() dto: CreateGuestPaymentDto) {
    return this.guestPayments.initiate(dto);
  }

  @Post('pending/:id/status')
  @ApiOperation({
    summary: 'Reconcile guest payment status using its access token',
  })
  status(@Param('id') id: string, @Body() dto: GuestPaymentAccessDto) {
    return this.guestPayments.status(id, dto.accessToken);
  }

  @Post('claim/request')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Email a one-time code to claim matching guest payments',
  })
  requestClaim(@Request() req: any) {
    return this.guestPayments.requestClaimCode(req.user.id);
  }

  @Post('claim/verify')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify a claim code and attach guest payments' })
  verifyClaim(@Request() req: any, @Body() dto: VerifyGuestClaimDto) {
    return this.guestPayments.verifyClaimCode(req.user.id, dto.code);
  }
}
