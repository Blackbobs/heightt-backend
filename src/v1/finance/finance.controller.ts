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
import { BankAccountService } from './bank-account.service';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BachsService } from '../bachs/bachs.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  AdminGuard,
  RequirePermission,
  RequireAdminType,
} from '../../common/guards/admin.guard';
import type { Response } from 'express';
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
  WithdrawalFilterDto,
  PlatformWithdrawalRequestDto,
  OrganizationWithdrawalRequestDto,
  UserWithdrawalRequestDto,
  WithdrawalQuoteDto,
  UpdateBankAccountDto,
  CreateBankAccountDto,
  ResolveBankAccountDto,
} from './dto';
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';
import { IdempotencyService } from '../../redis/idempotency.service';
import { IdempotencyKey } from '../../common/decorators/idempotency.decorator';
import { WalletGuard } from '../../common/guards/wallet.guard';

@ApiTags('finance')
@Controller('finance')
@UseGuards(JwtGuard, WalletGuard)
@ApiBearerAuth('access-token')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly receiptService: ReceiptService,
    private readonly ledgerService: LedgerService,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly bankAccountService: BankAccountService,
    private readonly bachsService: BachsService,
  ) {}

  // ============================================
  // WALLET ENDPOINTS
  // ============================================

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

  @Get('wallet/platform')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:read')
  @Cache({
    key: () => 'wallet:platform',
    ttl: 60,
    tags: ['finance', 'wallet', 'platform'],
  })
  @ApiOperation({
    summary: 'Get platform wallet (Platform Admin only)',
    description: 'Returns the platform wallet with balance and details.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Platform wallet retrieved',
  })
  async getPlatformWallet() {
    this.logger.log('Get platform wallet endpoint called');
    return this.financeService.getPlatformWallet();
  }

  @Get('organizations/:organizationId/overview')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `finance:organization:${request.params.organizationId}:overview:v2`;
    },
    ttl: 60,
    tags: ['finance', 'wallet', 'transactions', 'dues', 'payments'],
  })
  @ApiOperation({
    summary: 'Get organization finance overview (Admin only)',
    description:
      'Returns wallet balance, transaction totals, collections, pending payments, and due-payment totals for an organization within the admin scope.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Organization finance overview retrieved',
  })
  async getOrganizationFinanceOverview(
    @Param('organizationId') organizationId: string,
  ) {
    return this.financeService.getOrganizationFinanceOverview(organizationId);
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

  @Delete('dues/:id')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:due:delete')
  @InvalidateCache(['finance', 'dues', 'student'])
  @ApiOperation({ summary: 'Delete due (Admin only)' })
  @ApiParam({ name: 'id', description: 'Due ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Due deleted',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Due has payment activity and cannot be deleted',
  })
  async deleteDue(@Param('id') id: string, @Request() req: any) {
    this.logger.log(`Delete due endpoint called: ${id}`);
    return this.financeService.deleteDue(req.user.id, id);
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

  // ============================================
  // GET MY DUES - UPDATED ENDPOINT
  // ============================================

  @Get('dues/student')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `dues:student:${request.user.id}`;
    },
    ttl: 120,
    tags: ['finance', 'dues', 'student'],
  })
  @ApiOperation({
    summary: 'Get my dues',
    description:
      'Get all dues for the authenticated user across all organizations',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student dues retrieved',
  })
  async getStudentDues(@Request() req: any) {
    this.logger.log(
      `Get student dues endpoint called for user: ${req.user.id}`,
    );
    return this.financeService.getMyDues(req.user.id);
  }

  // ============================================
  // PAYMENT ENDPOINTS
  // ============================================

  @Get('payments/history')
  @ApiOperation({
    summary: 'Get my payment history',
    description:
      'Returns each payment with its transaction, due, organization, and receipt details.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  async getMyPaymentHistory(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.financeService.getStudentPaymentHistory(
      req.user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
      { status, organizationId },
    );
  }

  @Get('payments/history/admin')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:read')
  @ApiOperation({
    summary: 'Get student payment history (Admin only)',
    description:
      'Returns payments within the authenticated admin scope, including student, due, transaction, and receipt details.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'payerId', required: false })
  async getAdminPaymentHistory(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('payerId') payerId?: string,
  ) {
    return this.financeService.getAdminPaymentHistory(
      req.admin,
      parseInt(page, 10),
      parseInt(limit, 10),
      { status, organizationId, payerId },
    );
  }

  @Post('payments')
  @InvalidateCache(['finance', 'wallet', 'transactions', 'receipts'])
  @ApiOperation({
    summary: 'Initiate payment (Bachs checkout)',
    description:
      'Creates a Bachs checkout session for external payment processing. ' +
      'Used for paying dues, fees, and other charges via card, bank transfer, USSD, etc. ' +
      'Returns a checkout URL that the frontend should redirect the user to for payment.',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment initiated successfully, returns Bachs checkout URL',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Payment initiated successfully' },
        data: {
          type: 'object',
          properties: {
            checkoutId: { type: 'string' },
            checkoutUrl: { type: 'string' },
            pendingPaymentId: { type: 'string' },
            baseAmount: {
              type: 'number',
              description: 'Organization payment in Kobo',
            },
            platformFee: {
              type: 'number',
              description: 'Heightt platform fee in Kobo',
            },
            totalBeforeGatewayFee: {
              type: 'number',
              description: 'Checkout subtotal before any Bachs processing fee',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payment data or due not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async initiatePayment(@Request() req: any, @Body() dto: CreatePaymentDto) {
    this.logger.log(
      `Initiate payment endpoint called for user: ${req.user.id}`,
    );

    // Resolve dueId/dueAssignmentId to a valid dueAssignmentId
    const resolvedDueAssignmentId =
      await this.financeService.resolveDueAssignment(
        req.user.id,
        dto.dueId,
        dto.dueAssignmentId,
        dto.amount,
      );

    // Create Bachs checkout session
    const result = await this.bachsService.initiatePayment(
      req.user.id,
      {
        userId: req.user.id,
        organizationId: dto.organizationId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        dueAssignmentId: resolvedDueAssignmentId || undefined,
        category: dto.dueId || dto.dueAssignmentId ? 'DUE' : 'OTHER',
      },
      dto.successUrl,
      dto.cancelUrl,
    );

    return {
      success: true,
      message: 'Payment initiated successfully',
      data: result,
    };
  }

  @Get('payments/pending/:id/status')
  @ApiOperation({
    summary: 'Get and reconcile an external payment status',
    description:
      'Returns the authenticated user payment state and receipt identifiers. If still pending, the backend also checks Bachs for a terminal checkout state.',
  })
  @ApiParam({ name: 'id', description: 'Pending payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved',
  })
  async getPendingPaymentStatus(@Request() req: any, @Param('id') id: string) {
    return {
      success: true,
      data: await this.bachsService.getPendingPaymentStatus(id, req.user.id),
    };
  }

  @Post('payments/pending/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @InvalidateCache(['finance', 'payments'])
  @ApiOperation({ summary: 'Cancel the authenticated user pending payment' })
  @ApiParam({ name: 'id', description: 'Pending payment ID' })
  async cancelPendingPayment(@Request() req: any, @Param('id') id: string) {
    await this.bachsService.cancelPendingPayment(id, req.user.id);
    return { success: true, message: 'Payment cancelled' };
  }

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

  @Post('payments/manual')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:manual')
  @InvalidateCache(['finance', 'wallet', 'transactions', 'receipts'])
  @ApiOperation({
    summary: 'Make a manual payment (Admin only)',
    description:
      'Processes a manual payment. Idempotency key should be passed in the header.',
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
  // CHARGES CALCULATION
  // ============================================

  @Get('charges/calculate')
  @ApiOperation({
    summary: 'Calculate charges for a payment amount',
    description:
      'Returns detailed breakdown of all applicable fees including platform fee, Bachs fee, and VAT.',
  })
  @ApiQuery({
    name: 'amount',
    description: 'Amount in Kobo (e.g., 500000 = ₦5,000)',
    example: 500000,
  })
  async calculateCharges(@Query('amount') amount: string) {
    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const charges = this.ledgerService.calculatePaymentCharges(amountNum);

    return {
      originalAmount: {
        kobo: amountNum,
        naira: (amountNum / 100).toFixed(2),
        formatted: `₦${(amountNum / 100).toFixed(2)}`,
      },
      breakdown: {
        platformFee: {
          kobo: charges.platformFee,
          naira: (charges.platformFee / 100).toFixed(2),
          formatted: `₦${(charges.platformFee / 100).toFixed(2)}`,
          percentage: 'Fixed ₦100',
          recipient: 'Platform',
        },
        gatewayFee: {
          kobo: charges.gatewayFee,
          naira: (charges.gatewayFee / 100).toFixed(2),
          formatted: `₦${(charges.gatewayFee / 100).toFixed(2)}`,
          percentage: '1.5%',
          recipient: 'Bachs (Payment Gateway)',
        },
        vat: {
          kobo: charges.vat,
          naira: (charges.vat / 100).toFixed(2),
          formatted: `₦${(charges.vat / 100).toFixed(2)}`,
          percentage: '7.5% (on platform fee)',
          recipient: 'Government (VAT)',
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
        note: 'Organization receives the full original amount',
      },
      distribution: {
        toOrganization: {
          amount: charges.netToOrganization,
          percentage: 100,
          formatted: `₦${(charges.netToOrganization / 100).toFixed(2)}`,
        },
        toPlatform: {
          amount: charges.platformFee + charges.vat,
          percentage:
            ((charges.platformFee + charges.vat) / charges.totalAmount) * 100,
          formatted: `₦${((charges.platformFee + charges.vat) / 100).toFixed(2)}`,
          breakdown: {
            platformFee: `₦${(charges.platformFee / 100).toFixed(2)}`,
            vat: `₦${(charges.vat / 100).toFixed(2)}`,
          },
        },
        toGateway: {
          amount: charges.gatewayFee,
          percentage: (charges.gatewayFee / charges.totalAmount) * 100,
          formatted: `₦${(charges.gatewayFee / 100).toFixed(2)}`,
          recipient: 'Bachs',
        },
      },
    };
  }

  @Get('reports/overview')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:reports')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `reports:overview:v2:${request.query.institutionId || 'all'}`;
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
  // RECEIPT ENDPOINTS
  // ============================================

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

  @Get('receipts/:id/download')
  @ApiOperation({
    summary: 'Download receipt as branded PDF',
    description:
      'Renders the receipt with the organization logo, falling back through its hierarchy (department -> faculty -> institution), and streams it as a PDF file.',
  })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Receipt PDF stream' })
  async downloadReceiptPdf(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Download receipt PDF endpoint called: ${id}`);
    const { buffer, filename } = await this.receiptService.getReceiptPdfForUser(
      id,
      req.user.id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  // ============================================
  // BANK ACCOUNT ENDPOINTS
  // ============================================

  @Get('bank-accounts/supported-banks')
  @ApiOperation({ summary: 'Get Bachs-supported payout banks' })
  @ApiQuery({ name: 'countryCode', required: false, example: 'NG' })
  async getSupportedPayoutBanks(@Query('countryCode') countryCode = 'NG') {
    return this.bankAccountService.getSupportedBanks(countryCode);
  }

  @Post('bank-accounts/resolve')
  @ApiOperation({ summary: 'Verify a bank account with Bachs' })
  @ApiBody({ type: ResolveBankAccountDto })
  async resolveBankAccount(@Body() dto: ResolveBankAccountDto) {
    return this.bankAccountService.resolveBankAccount(dto);
  }

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Add bank account for withdrawals' })
  @ApiBody({ type: CreateBankAccountDto })
  @ApiResponse({ status: 201, description: 'Bank account added' })
  @InvalidateCache(['bank-accounts'])
  async createBankAccount(
    @Request() req: any,
    @Body() dto: CreateBankAccountDto,
  ) {
    this.logger.log('Create bank account endpoint called');
    return this.bankAccountService.createBankAccount(req.user.id, dto);
  }

  @Get('bank-accounts')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `bank-accounts:user:${request.user.id}`;
    },
    ttl: 300,
    tags: ['finance', 'bank-accounts'],
  })
  @ApiOperation({ summary: 'Get user bank accounts' })
  @ApiResponse({ status: 200, description: 'Bank accounts retrieved' })
  async getUserBankAccounts(@Request() req: any) {
    this.logger.log('Get user bank accounts endpoint called');
    return this.bankAccountService.getUserBankAccounts(req.user.id);
  }

  @Patch('bank-accounts/:id')
  @ApiOperation({ summary: 'Update bank account' })
  @ApiParam({ name: 'id', description: 'Bank account ID' })
  @ApiBody({ type: UpdateBankAccountDto })
  @ApiResponse({ status: 200, description: 'Bank account updated' })
  @InvalidateCache(['bank-accounts'])
  async updateBankAccount(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateBankAccountDto,
  ) {
    this.logger.log('Update bank account endpoint called');
    return this.bankAccountService.updateBankAccount(id, req.user.id, dto);
  }

  @Delete('bank-accounts/:id')
  @ApiOperation({ summary: 'Delete bank account' })
  @ApiParam({ name: 'id', description: 'Bank account ID' })
  @ApiResponse({ status: 200, description: 'Bank account deleted' })
  @InvalidateCache(['bank-accounts'])
  async deleteBankAccount(@Param('id') id: string, @Request() req: any) {
    this.logger.log('Delete bank account endpoint called');
    return this.bankAccountService.deleteBankAccount(id, req.user.id);
  }

  @Post('bank-accounts/:id/default')
  @ApiOperation({ summary: 'Set default bank account' })
  @ApiParam({ name: 'id', description: 'Bank account ID' })
  @ApiResponse({ status: 200, description: 'Default bank account updated' })
  @InvalidateCache(['bank-accounts'])
  async setDefaultBankAccount(@Param('id') id: string, @Request() req: any) {
    this.logger.log('Set default bank account endpoint called');
    return this.bankAccountService.setDefaultBankAccount(id, req.user.id);
  }

  @Post('bank-accounts/:id/payout-destination')
  @ApiOperation({
    summary: 'Register or refresh a bank account payout destination',
  })
  @ApiParam({ name: 'id', description: 'Bank account ID' })
  async prepareBankAccountPayout(@Param('id') id: string, @Request() req: any) {
    return this.financeService.prepareBankAccountPayout(req.user.id, id);
  }

  // ============================================
  // USER WITHDRAWAL ENDPOINTS
  // ============================================

  @Post('withdrawals/user')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({ summary: 'Request user withdrawal' })
  @ApiBody({ type: UserWithdrawalRequestDto })
  @ApiResponse({ status: 201, description: 'Withdrawal requested' })
  async requestUserWithdrawal(
    @Request() req: any,
    @Body() dto: UserWithdrawalRequestDto,
  ) {
    this.logger.log('Request user withdrawal endpoint called');
    return this.financeService.requestUserWithdrawal(req.user.id, dto);
  }

  @Post('withdrawals/organization')
  @UseGuards(AdminGuard)
  @RequirePermission('finance:withdrawal:create')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({ summary: 'Request an organization wallet withdrawal' })
  @ApiBody({ type: OrganizationWithdrawalRequestDto })
  async requestOrganizationWithdrawal(
    @Request() req: any,
    @Body() dto: OrganizationWithdrawalRequestDto,
  ) {
    return this.financeService.requestOrganizationWithdrawal(req.user.id, dto);
  }

  @Post('withdrawals/organization/:id/approve')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  async approveOrganizationWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.financeService.approveUserWithdrawal(id, req.user.id);
  }

  @Post('withdrawals/organization/:id/reject')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  async rejectOrganizationWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason?: string },
  ) {
    return this.financeService.rejectUserWithdrawal(
      id,
      req.user.id,
      body.reason,
    );
  }

  @Post('withdrawals/user/:id/approve')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({ summary: 'Approve user withdrawal (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiResponse({ status: 200, description: 'Withdrawal approved' })
  async approveUserWithdrawal(@Param('id') id: string, @Request() req: any) {
    this.logger.log('Approve user withdrawal endpoint called');
    return this.financeService.approveUserWithdrawal(id, req.user.id);
  }

  @Post('withdrawals/user/:id/reject')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({ summary: 'Reject user withdrawal (Platform Admin only)' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Withdrawal rejected' })
  async rejectUserWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason?: string },
  ) {
    this.logger.log('Reject user withdrawal endpoint called');
    return this.financeService.rejectUserWithdrawal(
      id,
      req.user.id,
      body.reason,
    );
  }

  // ============================================
  // PLATFORM WITHDRAWAL ENDPOINTS
  // ============================================

  @Post('withdrawals/platform')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:platform')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({
    summary: 'Request platform withdrawal (Platform Admin only)',
  })
  @ApiBody({ type: PlatformWithdrawalRequestDto })
  @ApiResponse({ status: 201, description: 'Platform withdrawal requested' })
  async requestPlatformWithdrawal(
    @Request() req: any,
    @Body() dto: PlatformWithdrawalRequestDto,
  ) {
    this.logger.log('Request platform withdrawal endpoint called');
    return this.financeService.requestPlatformWithdrawal(req.user.id, dto);
  }

  @Post('withdrawals/platform/:id/approve')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @InvalidateCache(['finance', 'wallet', 'withdrawals'])
  @ApiOperation({
    summary: 'Approve platform withdrawal (Platform Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiResponse({ status: 200, description: 'Platform withdrawal approved' })
  async approvePlatformWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    this.logger.log('Approve platform withdrawal endpoint called');
    return this.financeService.approvePlatformWithdrawal(id, req.user.id);
  }

  // ============================================
  // WITHDRAWAL HISTORY ENDPOINTS
  // ============================================

  @Get('withdrawals/quote')
  @ApiOperation({
    summary: 'Get available balance, fee, and maximum withdrawal amount',
  })
  @ApiResponse({ status: 200, description: 'Withdrawal quote returned' })
  async getWithdrawalQuote(
    @Request() req: any,
    @Query() dto: WithdrawalQuoteDto,
  ) {
    return this.financeService.getWithdrawalQuote(req.user.id, dto);
  }

  @Get('withdrawals')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const userId = request.user.id;
      const { status, type, organizationId, page, limit, startDate, endDate } =
        request.query;
      return `withdrawals:v2:user:${userId}:${organizationId || 'self'}:${status || 'all'}:${type || 'all'}:${page || 1}:${limit || 10}:${startDate || 'all'}:${endDate || 'all'}`;
    },
    ttl: 60,
    tags: ['finance', 'withdrawals'],
  })
  @ApiOperation({ summary: 'Get withdrawal history' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['USER', 'ORGANIZATION', 'PLATFORM'],
  })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description:
      'Organization wallet to query. Requires an active admin role within that organization scope.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO)' })
  @ApiResponse({ status: 200, description: 'Withdrawal history retrieved' })
  async getWithdrawalHistory(
    @Request() req: any,
    @Query() filters: WithdrawalFilterDto,
  ) {
    this.logger.log('Get withdrawal history endpoint called');
    return this.financeService.getWithdrawalHistory(req.user.id, filters);
  }

  @Get('withdrawals/admin')
  @UseGuards(AdminGuard)
  @RequireAdminType('PLATFORM_ADMIN')
  @RequirePermission('finance:withdrawal:approve')
  @ApiOperation({ summary: 'List withdrawal requests for platform review' })
  async getAdminWithdrawalHistory(
    @Request() req: any,
    @Query() filters: WithdrawalFilterDto,
  ) {
    return this.financeService.getWithdrawalHistory(req.user.id, filters, true);
  }

  @Get('withdrawals/:id')
  @ApiOperation({ summary: 'Get withdrawal by ID' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID' })
  @ApiResponse({ status: 200, description: 'Withdrawal retrieved' })
  async getWithdrawalById(@Param('id') id: string, @Request() req: any) {
    this.logger.log('Get withdrawal by ID endpoint called');
    return this.financeService.getWithdrawalById(id, req.user.id);
  }

  // ============================================
  // IDEMPOTENCY KEY ENDPOINT
  // ============================================

  @Post('idempotency-key')
  @ApiOperation({
    summary: 'Generate idempotency key',
    description:
      'Generates a unique idempotency key for payment processing to prevent duplicate payments.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Idempotency key generated',
    schema: {
      type: 'object',
      properties: {
        idempotencyKey: {
          type: 'string',
          example: 'pay_abc123def456',
        },
        expiresIn: {
          type: 'number',
          example: 3600,
        },
        message: {
          type: 'string',
          example: 'Idempotency key generated successfully',
        },
      },
    },
  })
  async generateIdempotencyKey(@Request() req: any) {
    this.logger.log('Generate idempotency key endpoint called');
    return this.financeService.generateIdempotencyKey(req.user.id);
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
