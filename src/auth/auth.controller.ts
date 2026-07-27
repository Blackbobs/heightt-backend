import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Request,
  Res,
  Get,
  Delete,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Request() req: any) {
    this.logger.log(`Register endpoint called for email: ${dto.email}`);
    return this.authService.register(dto, req);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(`Login endpoint called for identifier: ${dto.identifier}`);
    return this.authService.login(dto, req, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log('Refresh token endpoint called');
    return this.authService.refresh(req, res);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    this.logger.log('Logout endpoint called');
    return this.authService.logout(req, res);
  }

  @Post('logout-all')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log('Logout all devices endpoint called');
    return this.authService.logoutAll(req, res);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async getCurrentUser(@Request() req: any) {
    this.logger.log('Get current user endpoint called');
    return this.authService.getCurrentUser(req.user.id);
  }

  @Get('sessions')
  @UseGuards(JwtGuard)
  async getSessions(@Request() req: any) {
    this.logger.log('Get sessions endpoint called');
    return this.authService.getSessions(req.user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@Request() req: any, @Param('id') id: string) {
    this.logger.log('Revoke session endpoint called');
    return this.authService.revokeSession(req.user.id, id);
  }
}
