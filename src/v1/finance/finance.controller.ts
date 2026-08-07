// src/v1/finance/finance.controller.ts

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
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { LedgerService } from './ledger.service';
import { ReceiptService } from './receipt.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../../common/guards/admin.guard';
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
  GenerateReceiptDto,
  ReceiptResponseDto,
  ReceiptListResponseDto,
} from './dto';
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';
import { IdempotencyService } from '../../redis/idempotency.service';
import { IdempotencyKey } from '../../common/decorators/idempotency.decorator';

@ApiTags('finance')
@Controller('finance')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly receiptService: ReceiptService,
    private readonly ledgerService: LedgerService,
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  // ============================================
  // WALLET ENDPOINTS
  // ============================================

  @Post('wallet')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:create')
  @InvalidateCache(['finance', 'wallet'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `wallet:user:${request.user.id}`;
    },
    ttl: 60,
    tags: ['finance', 'wallet'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `wallet:user:admin:${request.params.userId}`;
    },
    ttl: 60,
    tags: ['finance', 'wallet', 'admin'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `wallet:organization:${request.params.organizationId}`;
    },
    ttl: 60,
    tags: ['finance', 'wallet', 'organization'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const userId = request.user.id;
      const { page, limit, type, status, startDate, endDate } = request.query;
      return `transactions:user:${userId}:${page || 1}:${limit || 10}:${type || 'all'}:${status || 'all'}:${startDate || 'all'}:${endDate || 'all'}`;
    },
    ttl: 30,
    tags: ['finance', 'transactions'],
  })
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
  @InvalidateCache(['finance', 'wallet', 'transactions'])
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
  @InvalidateCache(['finance', 'wallet', 'transactions'])
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
  @InvalidateCache(['finance', 'dues'])
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
  @InvalidateCache(['finance', 'dues', 'student'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { organizationId, page, limit } = request.query;
      return `dues:${organizationId || 'all'}:${page || 1}:${limit || 10}`;
    },
    ttl: 300,
    tags: ['finance', 'dues'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `dues:student:${request.user.id}`;
    },
    ttl: 120,
    tags: ['finance', 'dues', 'student'],
  })
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
  // PAYMENT ENDPOINTS (External - Bachs)
  // ============================================

  @Post('payments')
  @InvalidateCache(['finance', 'wallet', 'transactions', 'receipts'])
  @ApiOperation({
    summary: 'Make payment via Bachs',
    description:
      'Initiates a payment using Bachs checkout. Idempotency key should be passed in the header.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key to prevent duplicate payment processing',
    required: false,
    example: 'payment_1234567890_abc',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment initiated - returns checkout URL',
  })
  async makePayment(
    @Request() req: any,
    @Body() dto: CreatePaymentDto,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    this.logger.log('Make payment endpoint called');
    return this.financeService.processPayment(req.user.id, dto, idempotencyKey);
  }

  // ============================================
  // INTERNAL PAYMENT ENDPOINTS
  // ============================================

  @Post('payments/internal')
  @InvalidateCache(['finance', 'wallet', 'transactions', 'receipts'])
  @ApiOperation({
    summary: 'Make internal payment (wallet to organization)',
    description:
      'Processes a payment using internal wallet funds. Idempotency key should be passed in the header.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key to prevent duplicate payment processing',
    required: false,
    example: 'internal_1234567890_abc',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Internal payment processed',
  })
  async makeInternalPayment(
    @Request() req: any,
    @Body() dto: CreatePaymentDto,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    this.logger.log('Make internal payment endpoint called');
    return this.financeService.processInternalPayment(
      req.user.id,
      dto,
      idempotencyKey,
    );
  }

  // ============================================
  // MANUAL PAYMENT ENDPOINTS
  // ============================================

  @Post('payments/manual')
  @InvalidateCache(['finance', 'wallet', 'transactions', 'receipts'])
  @ApiOperation({
    summary: 'Make a manual payment',
    description:
      'Processes a manual payment (admin-only operation). Idempotency key should be passed in the header.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key to prevent duplicate payment processing',
    required: false,
    example: 'manual_1234567890_abc',
  })
  @ApiBody({ type: CreateManualPaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manual payment processed',
  })
  async makeManualPayment(
    @Request() req: any,
    @Body() dto: CreateManualPaymentDto,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    this.logger.log('Make manual payment endpoint called');
    return this.financeService.processManualPayment(
      req.user.id,
      dto,
      idempotencyKey,
    );
  }

  // ============================================
  // PENDING PAYMENT ENDPOINTS
  // ============================================

  @Get('payments/pending/:id')
  @ApiOperation({
    summary: 'Get pending payment status',
    description: 'Check the status of a pending payment',
  })
  @ApiParam({ name: 'id', description: 'Pending payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved',
  })
  async getPendingPaymentStatus(@Param('id') id: string, @Request() req: any) {
    return this.financeService.getPendingPaymentStatus(id, req.user.id);
  }

  @Post('payments/pending/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a pending payment',
    description: 'Cancel a pending payment before it is completed',
  })
  @ApiParam({ name: 'id', description: 'Pending payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment cancelled',
  })
  async cancelPendingPayment(@Param('id') id: string, @Request() req: any) {
    return this.financeService.cancelPendingPayment(id, req.user.id);
  }

  @Get('payments/success')
  @ApiOperation({
    summary: 'Payment success callback',
    description: 'Handle successful payment redirect from Bachs',
  })
  @ApiQuery({ name: 'checkout_id', description: 'Bachs checkout ID' })
  async paymentSuccess(
    @Query('checkout_id') checkoutId: string,
    @Request() req: any,
  ) {
    const pendingPayment = await this.prisma.pendingPayment.findFirst({
      where: { bachsCheckoutId: checkoutId },
    });

    if (!pendingPayment) {
      throw new NotFoundException('Payment not found');
    }

    if (pendingPayment.userId !== req.user.id) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    return this.financeService.getPendingPaymentStatus(
      pendingPayment.id,
      req.user.id,
    );
  }

  @Get('payments/cancel')
  @ApiOperation({
    summary: 'Payment cancel callback',
    description: 'Handle cancelled payment redirect from Bachs',
  })
  @ApiQuery({ name: 'checkout_id', description: 'Bachs checkout ID' })
  async paymentCancel(
    @Query('checkout_id') checkoutId: string,
    @Request() req: any,
  ) {
    const pendingPayment = await this.prisma.pendingPayment.findFirst({
      where: { bachsCheckoutId: checkoutId },
    });

    if (pendingPayment && pendingPayment.userId === req.user.id) {
      await this.financeService.cancelPendingPayment(
        pendingPayment.id,
        req.user.id,
      );
    }

    return { message: 'Payment cancelled' };
  }

  // ============================================
  // ORGANIZATION WITHDRAWAL ENDPOINTS
  // ============================================

  @Post('withdrawals/organization')
  @InvalidateCache(['finance', 'wallet', 'transactions'])
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
  @InvalidateCache(['finance', 'wallet', 'transactions'])
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
  @InvalidateCache(['finance', 'wallet', 'transactions'])
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
  @InvalidateCache(['finance', 'savings'])
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
  @InvalidateCache(['finance', 'savings', 'wallet', 'transactions'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `savings:user:${request.user.id}`;
    },
    ttl: 300,
    tags: ['finance', 'savings'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `organization:overview:${request.params.organizationId}:user:${request.user.id}`;
    },
    ttl: 300,
    tags: ['finance', 'organization', 'overview'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `organization:dashboard:${request.params.organizationId}:user:${request.user.id}`;
    },
    ttl: 300,
    tags: ['finance', 'organization', 'dashboard'],
  })
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
  @InvalidateCache(['finance', 'receipts'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const userId = request.user.id;
      const { page, limit, startDate, endDate, organizationId } = request.query;
      return `receipts:user:${userId}:${page || 1}:${limit || 10}:${startDate || 'all'}:${endDate || 'all'}:${organizationId || 'all'}`;
    },
    ttl: 300,
    tags: ['finance', 'receipts'],
  })
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `receipt:${request.params.id}`;
    },
    ttl: 3600,
    tags: ['finance', 'receipts'],
  })
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
  @InvalidateCache(['finance', 'receipts'])
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
  @InvalidateCache(['finance', 'receipts'])
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
  @InvalidateCache(['finance', 'receipts'])
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
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const organizationId = request.params.organizationId;
      const userId = request.user.id;
      const { page, limit } = request.query;
      return `receipts:organization:${organizationId}:user:${userId}:${page || 1}:${limit || 10}`;
    },
    ttl: 300,
    tags: ['finance', 'receipts', 'organization'],
  })
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
  // LEDGER ENDPOINTS
  // ============================================

  @Get('ledger/accounts')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { type, ownerType, ownerId, isActive } = request.query;
      return `ledger:accounts:${type || 'all'}:${ownerType || 'all'}:${ownerId || 'all'}:${isActive || 'all'}`;
    },
    ttl: 300,
    tags: ['finance', 'ledger'],
  })
  @ApiOperation({ summary: 'Get ledger accounts (Admin only)' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
  })
  @ApiQuery({
    name: 'ownerType',
    required: false,
    enum: ['USER', 'ORGANIZATION', 'PLATFORM', 'SYSTEM'],
  })
  @ApiQuery({
    name: 'ownerId',
    required: false,
    description: 'Filter by owner ID',
  })
  @ApiQuery({ name: 'isActive', required: false, type: 'boolean' })
  @ApiResponse({ status: 200, description: 'Ledger accounts retrieved' })
  async getLedgerAccounts(
    @Query('type') type?: string,
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
    @Query('isActive') isActive?: string,
  ) {
    this.logger.log('Get ledger accounts endpoint called');
    return this.ledgerService.getLedgerAccounts({
      type,
      ownerType,
      ownerId,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get('ledger/accounts/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `ledger:account:${request.params.id}`;
    },
    ttl: 300,
    tags: ['finance', 'ledger'],
  })
  @ApiOperation({ summary: 'Get ledger account by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Ledger account ID' })
  @ApiResponse({ status: 200, description: 'Ledger account retrieved' })
  async getLedgerAccountById(@Param('id') id: string) {
    this.logger.log(`Get ledger account by ID endpoint called: ${id}`);
    return this.ledgerService.getLedgerAccountById(id);
  }

  @Get('ledger/accounts/:id/balance')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `ledger:account:balance:${request.params.id}`;
    },
    ttl: 60,
    tags: ['finance', 'ledger'],
  })
  @ApiOperation({ summary: 'Get ledger account balance (Admin only)' })
  @ApiParam({ name: 'id', description: 'Ledger account ID' })
  @ApiResponse({ status: 200, description: 'Ledger account balance retrieved' })
  async getLedgerAccountBalance(@Param('id') id: string) {
    this.logger.log(`Get ledger account balance endpoint called: ${id}`);
    return this.ledgerService.getLedgerAccountBalance(id);
  }

  @Get('ledger/journals')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { status, startDate, endDate, transactionId, paymentId } =
        request.query;
      return `ledger:journals:${status || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${transactionId || 'all'}:${paymentId || 'all'}`;
    },
    ttl: 300,
    tags: ['finance', 'ledger', 'journal'],
  })
  @ApiOperation({ summary: 'Get journal entries (Admin only)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'POSTED', 'REVERSED', 'VOIDED'],
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiQuery({
    name: 'transactionId',
    required: false,
    description: 'Filter by transaction ID',
  })
  @ApiQuery({
    name: 'paymentId',
    required: false,
    description: 'Filter by payment ID',
  })
  @ApiResponse({ status: 200, description: 'Journal entries retrieved' })
  async getJournalEntries(
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('transactionId') transactionId?: string,
    @Query('paymentId') paymentId?: string,
  ) {
    this.logger.log('Get journal entries endpoint called');
    return this.ledgerService.getJournalEntries({
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      transactionId,
      paymentId,
    });
  }

  @Get('ledger/journals/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `ledger:journal:${request.params.id}`;
    },
    ttl: 300,
    tags: ['finance', 'ledger', 'journal'],
  })
  @ApiOperation({ summary: 'Get journal entry by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiResponse({ status: 200, description: 'Journal entry retrieved' })
  async getJournalEntryById(@Param('id') id: string) {
    this.logger.log(`Get journal entry by ID endpoint called: ${id}`);
    return this.ledgerService.getJournalEntryById(id);
  }

  @Post('ledger/journals/:id/reverse')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:manage')
  @InvalidateCache(['finance', 'ledger', 'journal'])
  @ApiOperation({ summary: 'Reverse journal entry (Admin only)' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiBody({
    schema: { type: 'object', properties: { reason: { type: 'string' } } },
  })
  @ApiResponse({ status: 200, description: 'Journal entry reversed' })
  async reverseJournalEntry(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason: string },
  ) {
    this.logger.log(`Reverse journal entry endpoint called: ${id}`);
    return this.ledgerService.reverseJournalEntry(id, body.reason, req.user.id);
  }

  @Post('ledger/reconcile')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:manage')
  @InvalidateCache(['finance', 'ledger'])
  @ApiOperation({ summary: 'Reconcile ledger accounts (Admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
      },
      required: ['startDate', 'endDate'],
    },
  })
  @ApiResponse({ status: 200, description: 'Reconciliation completed' })
  async reconcileAccounts(
    @Request() req: any,
    @Body() body: { startDate: string; endDate: string },
  ) {
    this.logger.log('Reconcile accounts endpoint called');
    return this.ledgerService.reconcileAccounts(
      new Date(body.startDate),
      new Date(body.endDate),
    );
  }

  // ============================================
  // CHARGES CALCULATION
  // ============================================

  @Get('charges/calculate')
  @ApiOperation({ summary: 'Calculate charges for a payment amount' })
  @ApiQuery({ name: 'amount', description: 'Amount in Kobo' })
  async calculateCharges(@Query('amount') amount: string) {
    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const charges = this.ledgerService.calculatePaymentCharges(amountNum);

    return {
      amount: {
        kobo: amountNum,
        naira: (amountNum / 100).toFixed(2),
        formatted: `₦${(amountNum / 100).toFixed(2)}`,
      },
      charges: {
        platformFee: {
          kobo: charges.platformFee,
          naira: (charges.platformFee / 100).toFixed(2),
          formatted: `₦${(charges.platformFee / 100).toFixed(2)}`,
          percentage: '2%',
        },
        paystackFee: {
          kobo: charges.paystackFee,
          naira: (charges.paystackFee / 100).toFixed(2),
          formatted: `₦${(charges.paystackFee / 100).toFixed(2)}`,
          percentage: '1.5% + ₦100',
        },
        vat: {
          kobo: charges.vat,
          naira: (charges.vat / 100).toFixed(2),
          formatted: `₦${(charges.vat / 100).toFixed(2)}`,
          percentage: '7.5% (on platform fee)',
        },
        totalCharges: {
          kobo: charges.totalCharges,
          naira: (charges.totalCharges / 100).toFixed(2),
          formatted: `₦${(charges.totalCharges / 100).toFixed(2)}`,
        },
      },
      totalToPay: {
        kobo: charges.totalAmount,
        naira: (charges.totalAmount / 100).toFixed(2),
        formatted: `₦${(charges.totalAmount / 100).toFixed(2)}`,
      },
      organizationReceives: {
        kobo: charges.netToOrganization,
        naira: (charges.netToOrganization / 100).toFixed(2),
        formatted: `₦${(charges.netToOrganization / 100).toFixed(2)}`,
      },
    };
  }

  // ============================================
  // REPORT ENDPOINTS
  // ============================================

  @Get('reports/overview')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:reports')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `reports:overview:${request.query.institutionId || 'all'}`;
    },
    ttl: 900,
    tags: ['finance', 'reports'],
  })
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

  // ============================================
  // IDEMPOTENCY KEY GENERATION
  // ============================================

  @Post('idempotency-key')
  @ApiOperation({
    summary: 'Generate idempotency key',
    description: 'Generates a unique idempotency key for payment requests',
  })
  @ApiResponse({
    status: 200,
    description: 'Idempotency key generated',
    schema: {
      type: 'object',
      properties: {
        idempotencyKey: { type: 'string' },
        expiresIn: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async generateIdempotencyKey(@Request() req: any) {
    const key = this.idempotencyService.generateKey();
    return {
      idempotencyKey: key,
      expiresIn: 86400,
      message:
        'Use this key in the Idempotency-Key header of your payment request',
    };
  }

  // ============================================
  // CACHE INVALIDATION ENDPOINT (Admin only)
  // ============================================

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:manage')
  @InvalidateCache([
    'finance',
    'wallet',
    'transactions',
    'dues',
    'savings',
    'receipts',
    'ledger',
    'reports',
  ])
  @ApiOperation({
    summary: 'Invalidate finance cache (Admin only)',
    description: 'Clear all finance-related cache.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Specific user to invalidate (optional)',
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
    description: 'Finance cache invalidated',
  })
  async invalidateFinanceCache(
    @Body() body: { userId?: string; reason?: string },
    @Request() req: any,
  ) {
    this.logger.log(
      `Invalidate finance cache endpoint called. Reason: ${body.reason || 'Not specified'}`,
    );

    await this.financeService.invalidateFinanceCache(body.userId);

    return {
      message: 'Finance cache invalidated successfully',
      reason: body.reason || 'Not specified',
      invalidatedBy: req.user.id,
      invalidatedAt: new Date().toISOString(),
      userId: body.userId || 'all users',
    };
  }
}
