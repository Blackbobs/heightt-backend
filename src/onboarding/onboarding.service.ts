import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { OnboardingPersonalInfoDto, OnboardingInstitutionDto } from './dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async updatePersonalInfo(userId: string, dto: OnboardingPersonalInfoDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile) {
      throw new NotFoundException('User profile not found');
    }

    const updatedProfile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        phone: dto.phone,
        avatar: dto.avatar,
        gender: dto.gender as any,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        country: dto.country,
        state: dto.state,
        city: dto.city,
        address: dto.address,
        bio: dto.bio,
        interests: dto.interests || [],
        onboardingStep: 'INSTITUTION',
      },
    });

    // Invalidate cache
    await this.cacheService.invalidateUserCache(userId);

    this.logger.log(`User ${userId} updated personal info`);

    return {
      message: 'Personal information updated successfully',
      onboardingStep: 'INSTITUTION',
      profile: updatedProfile,
    };
  }

  async updateInstitutionInfo(userId: string, dto: OnboardingInstitutionDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('User or profile not found');
    }

    const updatedProfile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        levelId: dto.levelId,
        matricNumber: dto.matricNumber,
        graduationYear: dto.graduationYear,
        onboardingStep: 'INTERESTS',
      },
    });

    await this.cacheService.invalidateUserCache(userId);

    this.logger.log(`User ${userId} updated institution info`);

    return {
      message: 'Institution information updated successfully',
      onboardingStep: 'INTERESTS',
      profile: updatedProfile,
    };
  }

  async completeOnboarding(userId: string, interests?: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('User or profile not found');
    }

    if (user.profile.onboardingCompleted) {
      throw new BadRequestException('Onboarding already completed');
    }

    const updatedProfile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        interests: interests || [],
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    });

    await this.cacheService.invalidateUserCache(userId);

    this.logger.log(`User ${userId} completed onboarding`);

    return {
      message: 'Onboarding completed successfully',
      onboardingCompleted: true,
      profile: updatedProfile,
    };
  }

  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('User or profile not found');
    }

    return {
      onboardingStep: user.profile.onboardingStep,
      onboardingCompleted: user.profile.onboardingCompleted,
    };
  }
}
