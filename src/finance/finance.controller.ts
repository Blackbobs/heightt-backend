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
  NotFoundException,
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
import { FinanceService } from './finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../common/guards/admin.guard';
import {
  CreateWalletDto,
  CreditWalletDto,
  DebitWalletDto,
  CreateDueDto,
  AssignDueDto,
  CreatePaymentDto,
  CreateManualPaymentDto,
  WithdrawalRequestDto,
  CreateSavingsGoalDto,
  SavingsDepositDto,
  ReceiptListResponseDto,
  ReceiptResponseDto,
  GenerateReceiptDto,
} from './dto';
import { ReceiptService } from './receipt.service';

@ApiTags('finance')
@Controller('finance')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly receiptService: ReceiptService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================
  // WALLET ENDPOINTS
  // ============================================

  @Post('wallet')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:create')
  @ApiOperation({ summary: 'Create wallet (Admin only)' })
  @ApiBody({ type: CreateWalletDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Wallet created successfully',
  })
  async createWallet(@Request() req: any, @Body() dto: CreateWalletDto) {
    this.logger.log('Create wallet endpoint called');
    return this.financeService.createWallet(req.user.id, dto);
  }

  @Get('wallet/me')
  @ApiOperation({ summary: 'Get my wallet' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Wallet retrieved',
  })
  async getMyWallet(@Request() req: any) {
    this.logger.log('Get my wallet endpoint called');
    return this.financeService.getWalletByUserId(req.user.id);
  }

  @Get('wallet/user/:userId')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @ApiOperation({ summary: 'Get wallet by user ID (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Wallet retrieved',
  })
  async getWalletByUserId(@Param('userId') userId: string) {
    this.logger.log(`Get wallet by user ID endpoint called: ${userId}`);
    return this.financeService.getWalletByUserId(userId);
  }

  @Get('wallet/organization/:organizationId')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @ApiOperation({ summary: 'Get wallet by organization ID (Admin only)' })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization wallet retrieved',
  })
  async getWalletByOrganizationId(
    @Param('organizationId') organizationId: string,
  ) {
    this.logger.log(
      `Get wallet by organization ID endpoint called: ${organizationId}`,
    );
    return this.financeService.getWalletByOrganizationId(organizationId);
  }

  // ============================================
  // TRANSACTION ENDPOINTS
  // ============================================

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['CREDIT', 'DEBIT', 'TRANSFER', 'FEE', 'REFUND', 'REVERSAL'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction history retrieved',
  })
  async getTransactions(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log('Get transactions endpoint called');
    return this.financeService.getTransactionHistory(
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
      { type, status, startDate, endDate },
    );
  }

  // ============================================
  // WALLET OPERATIONS (ADMIN)
  // ============================================

  @Post('wallet/credit')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:credit')
  @ApiOperation({ summary: 'Credit wallet (Admin only)' })
  @ApiBody({ type: CreditWalletDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Wallet credited',
  })
  async creditWallet(@Request() req: any, @Body() dto: CreditWalletDto) {
    this.logger.log('Credit wallet endpoint called');
    return this.financeService.creditWallet(req.user.id, dto);
  }

  @Post('wallet/debit')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:debit')
  @ApiOperation({ summary: 'Debit wallet (Admin only)' })
  @ApiBody({ type: DebitWalletDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Wallet debited',
  })
  async debitWallet(@Request() req: any, @Body() dto: DebitWalletDto) {
    this.logger.log('Debit wallet endpoint called');
    return this.financeService.debitWallet(req.user.id, dto);
  }

  // ============================================
  // DUE ENDPOINTS
  // ============================================

  @Post('dues')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:due:create')
  @ApiOperation({ summary: 'Create due (Admin only)' })
  @ApiBody({ type: CreateDueDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Due created',
  })
  async createDue(@Request() req: any, @Body() dto: CreateDueDto) {
    this.logger.log('Create due endpoint called');
    return this.financeService.createDue(req.user.id, dto);
  }

  @Post('dues/:id/assign')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:due:assign')
  @ApiOperation({ summary: 'Assign due to students (Admin only)' })
  @ApiParam({ name: 'id', description: 'Due ID' })
  @ApiBody({ type: AssignDueDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Due assigned',
  })
  async assignDue(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: AssignDueDto,
  ) {
    this.logger.log(`Assign due endpoint called: ${id}`);
    return this.financeService.assignDueToStudents(req.user.id, id, dto);
  }

  @Get('dues')
  @ApiOperation({ summary: 'Get dues' })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description: 'Filter by organization',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dues retrieved',
  })
  async getDues(
    @Query('organizationId') organizationId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log('Get dues endpoint called');
    return this.financeService.getDues(
      organizationId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('dues/student')
  @ApiOperation({ summary: 'Get my dues' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student dues retrieved',
  })
  async getStudentDues(@Request() req: any) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    this.logger.log('Get student dues endpoint called');
    return this.financeService.getStudentDues(student.id);
  }

  // ============================================
  // PAYMENT ENDPOINTS
  // ============================================

  @Post('payments')
  @ApiOperation({ summary: 'Make payment' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment processed',
  })
  async makePayment(@Request() req: any, @Body() dto: CreatePaymentDto) {
    this.logger.log('Make payment endpoint called');
    return this.financeService.processPayment(req.user.id, dto);
  }

  @Post('payments/manual')
  @ApiOperation({ summary: 'Make a manual payment (non-due payment)' })
  @ApiBody({ type: CreateManualPaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manual payment processed',
  })
  async makeManualPayment(
    @Request() req: any,
    @Body() dto: CreateManualPaymentDto,
  ) {
    this.logger.log('Make manual payment endpoint called');
    return this.financeService.processManualPayment(req.user.id, dto);
  }

  // ============================================
  // ORGANIZATION WITHDRAWAL ENDPOINTS
  // ============================================

  @Post('withdrawals/organization')
  @ApiOperation({ summary: 'Request organization withdrawal (Admin only)' })
  @ApiBody({ type: WithdrawalRequestDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Withdrawal requested',
  })
  async requestOrganizationWithdrawal(
    @Request() req: any,
    @Body() dto: WithdrawalRequestDto,
  ) {
    this.logger.log('Request organization withdrawal endpoint called');
    return this.financeService.requestOrganizationWithdrawal(req.user.id, dto);
  }

  @Post('withdrawals/organization/:id/approve')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:process')
  @ApiOperation({
    summary: 'Approve organization withdrawal (Platform Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Withdrawal approved',
  })
  async approveOrganizationWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    this.logger.log(`Approve organization withdrawal endpoint called: ${id}`);
    return this.financeService.approveOrganizationWithdrawal(id, req.user.id);
  }

  @Post('withdrawals/organization/:id/reject')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:process')
  @ApiOperation({
    summary: 'Reject organization withdrawal (Platform Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Withdrawal rejected',
  })
  async rejectOrganizationWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason?: string },
  ) {
    this.logger.log(`Reject organization withdrawal endpoint called: ${id}`);
    return this.financeService.rejectOrganizationWithdrawal(
      id,
      req.user.id,
      body.reason,
    );
  }

  // ============================================
  // SAVINGS GOALS ENDPOINTS
  // ============================================

  @Post('savings')
  @ApiOperation({ summary: 'Create savings goal' })
  @ApiBody({ type: CreateSavingsGoalDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Savings goal created',
  })
  async createSavingsGoal(
    @Request() req: any,
    @Body() dto: CreateSavingsGoalDto,
  ) {
    this.logger.log('Create savings goal endpoint called');
    return this.financeService.createSavingsGoal(req.user.id, dto);
  }

  @Post('savings/deposit')
  @ApiOperation({ summary: 'Deposit to savings goal' })
  @ApiBody({ type: SavingsDepositDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deposit completed',
  })
  async depositToSavings(@Request() req: any, @Body() dto: SavingsDepositDto) {
    this.logger.log('Deposit to savings endpoint called');
    return this.financeService.depositToSavings(req.user.id, dto);
  }

  @Get('savings')
  @ApiOperation({ summary: 'Get savings goals' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Savings goals retrieved',
  })
  async getSavingsGoals(@Request() req: any) {
    this.logger.log('Get savings goals endpoint called');
    return this.financeService.getSavingsGoals(req.user.id);
  }

  // ============================================
  // ORGANIZATION FINANCIAL OVERVIEW ENDPOINTS
  // ============================================

  @Get('organizations/:organizationId/overview')
  @ApiOperation({
    summary: 'Get financial overview for an organization',
    description:
      'Returns comprehensive financial overview for a specific organization. Accessible by organization admins and staff.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Financial overview retrieved',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Organization not found',
  })
  async getOrganizationFinancialOverview(
    @Param('organizationId') organizationId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Get organization financial overview endpoint called: ${organizationId}`,
    );
    return this.financeService.getOrganizationFinancialOverview(
      organizationId,
      req.user.id,
    );
  }

  @Get('organizations/:organizationId/dashboard')
  @ApiOperation({
    summary: 'Get comprehensive finance dashboard for an organization',
    description:
      'Returns detailed finance dashboard including transactions, payments, due assignments, top contributors, and overdue dues.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Finance dashboard retrieved',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Organization not found',
  })
  async getOrganizationFinanceDashboard(
    @Param('organizationId') organizationId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Get organization finance dashboard endpoint called: ${organizationId}`,
    );
    return this.financeService.getOrganizationFinanceDashboard(
      organizationId,
      req.user.id,
    );
  }

  // ============================================
  // RECEIPT ENDPOINTS
  // ============================================

  @Post('receipts')
  @ApiOperation({
    summary: 'Generate receipt',
    description: 'Generate a receipt for a payment.',
  })
  @ApiBody({ type: GenerateReceiptDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Receipt generated',
    type: ReceiptResponseDto,
  })
  async generateReceipt(@Request() req: any, @Body() dto: GenerateReceiptDto) {
    this.logger.log('Generate receipt endpoint called');
    return this.receiptService.generateReceipt(req.user.id, dto);
  }

  @Get('receipts')
  @ApiOperation({
    summary: 'Get user receipts',
    description: 'Get all receipts for the authenticated user.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
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
    name: 'organizationId',
    required: false,
    description: 'Filter by organization',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Receipts retrieved',
    type: ReceiptListResponseDto,
  })
  async getUserReceipts(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    this.logger.log('Get user receipts endpoint called');
    return this.receiptService.getUserReceipts(
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
      { startDate, endDate, organizationId },
    );
  }

  @Get('receipts/:id')
  @ApiOperation({
    summary: 'Get receipt by ID',
    description: 'Get a specific receipt by ID.',
  })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Receipt retrieved',
    type: ReceiptResponseDto,
  })
  async getReceiptById(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Get receipt by ID endpoint called: ${id}`);
    return this.receiptService.getReceiptById(id, req.user.id);
  }

  @Post('receipts/:id/download')
  @ApiOperation({
    summary: 'Track receipt download',
    description: 'Track when a receipt is downloaded.',
  })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Download tracked',
  })
  async trackDownload(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Track receipt download endpoint called: ${id}`);
    return this.receiptService.trackDownload(id, req.user.id);
  }

  @Post('receipts/:id/view')
  @ApiOperation({
    summary: 'Track receipt view',
    description: 'Track when a receipt is viewed.',
  })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'View tracked',
  })
  async markViewed(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Mark receipt viewed endpoint called: ${id}`);
    return this.receiptService.markViewed(id, req.user.id);
  }

  @Post('receipts/:id/void')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:manage')
  @ApiOperation({
    summary: 'Void receipt (Admin only)',
    description: 'Void a receipt. Only platform admins can do this.',
  })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Receipt voided',
  })
  async voidReceipt(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason?: string },
  ) {
    this.logger.log(`Void receipt endpoint called: ${id}`);
    return this.receiptService.voidReceipt(id, req.user.id, body.reason);
  }

  @Get('organizations/:organizationId/receipts')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @ApiOperation({
    summary: 'Get organization receipts (Admin only)',
    description: 'Get all receipts for a specific organization.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization receipts retrieved',
    type: ReceiptListResponseDto,
  })
  async getOrganizationReceipts(
    @Param('organizationId') organizationId: string,
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(
      `Get organization receipts endpoint called: ${organizationId}`,
    );
    return this.receiptService.getOrganizationReceipts(
      organizationId,
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
  // ============================================
  // REPORT ENDPOINTS
  // ============================================

  @Get('reports/overview')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:reports')
  @ApiOperation({ summary: 'Get financial overview (Admin only)' })
  @ApiQuery({
    name: 'institutionId',
    required: false,
    description: 'Filter by institution',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Financial overview retrieved',
  })
  async getFinancialOverview(@Query('institutionId') institutionId?: string) {
    this.logger.log('Get financial overview endpoint called');
    return this.financeService.getFinancialOverview(institutionId);
  }
}
