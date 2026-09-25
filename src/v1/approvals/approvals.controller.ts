import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminGuard, RequireAdminType } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ApprovalRequestStatus } from '../generated/prisma/enums';
import { ApprovalsService } from './approvals.service';

class ReviewApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MinLength(3)
  rejectionReason?: string;
}

@Controller('approvals')
@UseGuards(JwtGuard, AdminGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @RequireAdminType('PLATFORM_ADMIN')
  @Get()
  list(@Query('status') status?: ApprovalRequestStatus) {
    return this.approvals.list(status);
  }

  @RequireAdminType('PLATFORM_ADMIN')
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body() dto: ReviewApprovalDto,
  ) {
    return this.approvals.review(
      id,
      req.user.id,
      dto.status,
      dto.rejectionReason,
    );
  }
}
