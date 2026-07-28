import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Patch,
  Get,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import {
  OnboardingPersonalInfoDto,
  OnboardingInstitutionDto,
} from './dto/onboarding.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('onboarding')
@UseGuards(JwtGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Patch('personal-info')
  async updatePersonalInfo(
    @Request() req: any,
    @Body() dto: OnboardingPersonalInfoDto,
  ) {
    return this.onboardingService.updatePersonalInfo(req.user.id, dto);
  }

  @Patch('institution')
  async updateInstitution(
    @Request() req: any,
    @Body() dto: OnboardingInstitutionDto,
  ) {
    return this.onboardingService.updateInstitutionInfo(req.user.id, dto);
  }

  @Get('status')
  async getStatus(@Request() req: any) {
    return this.onboardingService.getOnboardingStatus(req.user.id);
  }
}
