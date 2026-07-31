import {
  Controller,
  Get,
  Query,
  Param,
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
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Get audit logs' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filter by action',
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    description: 'Filter by entity',
  })
  @ApiQuery({
    name: 'entityId',
    required: false,
    description: 'Filter by entity ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit logs retrieved',
  })
  async getAuditLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log('Get audit logs endpoint called');
    return this.auditService.getAuditLogs(
      parseInt(page, 10),
      parseInt(limit, 10),
      { userId, action, entity, entityId, startDate, endDate },
    );
  }

  @Get('users/:userId')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Get user audit logs' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User audit logs retrieved',
  })
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.auditService.getUserAuditLogs(
      userId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('entities/:entity/:entityId')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Get entity audit logs' })
  @ApiParam({ name: 'entity', description: 'Entity type' })
  @ApiParam({ name: 'entityId', description: 'Entity ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Entity audit logs retrieved',
  })
  async getEntityAuditLogs(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.auditService.getEntityAuditLogs(
      entity,
      entityId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('organizations/:organizationId')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Get organization audit logs' })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization audit logs retrieved',
  })
  async getOrganizationAuditLogs(
    @Param('organizationId') organizationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.auditService.getOrganizationAuditLogs(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('summary')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Get audit summary' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit summary retrieved',
  })
  async getAuditSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.getAuditSummary(startDate, endDate);
  }
}
