// src/v1/onboarding/onboarding.controller.ts

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
import { JwtGuard } from '../../common/guards/jwt.guard';
import {
  OnboardingPersonalInfoDto,
  OnboardingInstitutionDto,
  CompleteOnboardingDto,
} from './dto/onboarding.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import {
  Cache,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Patch('personal-info')
  @InvalidateCache(['onboarding', 'user'])
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

  @Post('complete')
  @InvalidateCache(['onboarding', 'user'])
  @ApiOperation({
    summary: 'Complete onboarding',
    description: 'Marks the onboarding process as completed.',
  })
  @ApiOkResponse({ description: 'Onboarding completed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async completeOnboarding(
    @Request() req: any,
    @Body() body: CompleteOnboardingDto,
  ) {
    return this.onboardingService.completeOnboarding(req.user.id, body);
  }

  @Patch('institution')
  @InvalidateCache(['onboarding', 'user'])
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

  @Get('check')
  @ApiOperation({
    summary: 'Check if user needs onboarding',
    description: 'Returns whether the user has completed onboarding.',
  })
  @ApiOkResponse({
    description: 'Onboarding status check result',
    schema: {
      type: 'object',
      properties: {
        needsOnboarding: { type: 'boolean' },
        onboardingCompleted: { type: 'boolean' },
        onboardingStep: { type: 'string' },
        redirectTo: { type: 'string' },
      },
    },
  })
  async checkOnboardingStatus(@Request() req: any) {
    const status = await this.onboardingService.getOnboardingStatus(
      req.user.id,
    );

    return {
      needsOnboarding: !status.onboardingCompleted,
      onboardingCompleted: status.onboardingCompleted,
      onboardingStep: status.onboardingStep,
      redirectTo: status.onboardingCompleted ? '/dashboard' : '/onboarding',
    };
  }

  @Get('status')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `onboarding:status:${request.user.id}`;
    },
    ttl: 60,
    tags: ['onboarding', 'user'],
  })
  @ApiOperation({
    summary: 'Get onboarding status',
    description: 'Returns the current onboarding progress for the user.',
  })
  @ApiOkResponse({ description: 'Onboarding status retrieved' })
  async getStatus(@Request() req: any) {
    return this.onboardingService.getOnboardingStatus(req.user.id);
  }
}
