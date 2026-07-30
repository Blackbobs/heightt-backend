import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Patch,
  Get,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import {
  OnboardingPersonalInfoDto,
  OnboardingInstitutionDto,
} from './dto/onboarding.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Patch('personal-info')
  @ApiOperation({
    summary: 'Update personal information',
    description: "Updates the user's personal information during onboarding.",
  })
  @ApiOkResponse({ description: 'Personal information updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async updatePersonalInfo(
    @Request() req: any,
    @Body() dto: OnboardingPersonalInfoDto,
  ) {
    return this.onboardingService.updatePersonalInfo(req.user.id, dto);
  }

  @Patch('institution')
  @ApiOperation({
    summary: 'Update institution information',
    description:
      "Updates the user's institution and academic information during onboarding.",
  })
  @ApiOkResponse({
    description: 'Institution information updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or relationships' })
  @ApiNotFoundResponse({ description: 'User or institution not found' })
  async updateInstitution(
    @Request() req: any,
    @Body() dto: OnboardingInstitutionDto,
  ) {
    return this.onboardingService.updateInstitutionInfo(req.user.id, dto);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get onboarding status',
    description: 'Returns the current onboarding progress for the user.',
  })
  @ApiOkResponse({ description: 'Onboarding status retrieved' })
  async getStatus(@Request() req: any) {
    return this.onboardingService.getOnboardingStatus(req.user.id);
  }
}
