import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtGuard } from '../common/guards/jwt.guard';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('student')
  @ApiOperation({ summary: 'Get student dashboard' })
  @ApiResponse({ status: 200, description: 'Student dashboard retrieved' })
  async getStudentDashboard(@Request() req: any) {
    return this.dashboardService.getStudentDashboard(req.user.id);
  }

  @Get('admin')
  @ApiOperation({ summary: 'Get admin dashboard' })
  @ApiResponse({ status: 200, description: 'Admin dashboard retrieved' })
  async getAdminDashboard(@Request() req: any) {
    return this.dashboardService.getAdminDashboard(req.user.id);
  }

  @Get('platform-admin')
  @ApiOperation({ summary: 'Get platform admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Platform admin dashboard retrieved',
  })
  async getPlatformAdminDashboard(@Request() req: any) {
    return this.dashboardService.getPlatformAdminDashboard(req.user.id);
  }
}
