// src/v1/onboarding/onboarding.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { OnboardingPersonalInfoDto, OnboardingInstitutionDto } from './dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateOnboardingCache(userId: string): Promise<void> {
    try {
      // Invalidate onboarding tags
      await this.cacheService.invalidateByTag('onboarding');
      await this.cacheService.invalidateByTag('user');
      // Delete specific user onboarding cache
      await this.cacheService.delete(`onboarding:status:${userId}`);
      // Also invalidate user profile cache
      await this.cacheService.invalidateUserCache(userId);

      this.logger.debug(`Onboarding cache invalidated for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate onboarding cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // UPDATE PERSONAL INFO
  // ============================================

  async updatePersonalInfo(userId: string, dto: OnboardingPersonalInfoDto) {
    this.logger.log(`Updating personal info for user: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile) {
      throw new NotFoundException('User profile not found');
    }

    // Validate date of birth
    if (dto.dateOfBirth) {
      const dob = new Date(dto.dateOfBirth);
      if (isNaN(dob.getTime())) {
        throw new BadRequestException('Invalid date of birth format');
      }
      // Check if user is at least 16 years old
      const age = new Date().getFullYear() - dob.getFullYear();
      if (age < 16) {
        throw new BadRequestException('You must be at least 16 years old');
      }
    }

    // Update UserProfile
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
        onboardingStep: 'INSTITUTION',
      },
    });

    // Update student profile onboarding step if it exists
    if (user.studentProfile) {
      await this.prisma.studentProfile.update({
        where: { userId },
        data: {
          onboardingStep: 'INSTITUTION',
        },
      });
    }

    // Log onboarding progress
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ONBOARDING_PERSONAL_INFO',
        details: JSON.stringify({
          step: 'PERSONAL_INFO',
          completed: true,
          hasPhone: !!dto.phone,
          hasDateOfBirth: !!dto.dateOfBirth,
        }),
      },
    });

    // Invalidate cache
    await this.invalidateOnboardingCache(userId);

    this.logger.log(`User ${userId} updated personal info successfully`);

    return {
      message: 'Personal information updated successfully',
      onboardingStep: 'INSTITUTION',
      profile: updatedProfile,
    };
  }

  // ============================================
  // UPDATE INSTITUTION INFO
  // ============================================

  async updateInstitutionInfo(userId: string, dto: OnboardingInstitutionDto) {
    this.logger.log(`Updating institution info for user: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate all references exist
    const [institution, faculty, department, level] = await Promise.all([
      this.prisma.institution.findUnique({
        where: { id: dto.institutionId },
        include: { faculties: true },
      }),
      this.prisma.faculty.findUnique({
        where: { id: dto.facultyId },
        include: { departments: true },
      }),
      this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        include: { academicLevels: true },
      }),
      this.prisma.academicLevel.findUnique({
        where: { id: dto.levelId },
      }),
    ]);

    // Validate each entity exists
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    // Validate relationships
    if (faculty.institutionId !== institution.id) {
      throw new BadRequestException(
        'Faculty does not belong to the selected institution',
      );
    }
    if (department.facultyId !== faculty.id) {
      throw new BadRequestException(
        'Department does not belong to the selected faculty',
      );
    }
    if (level.departmentId !== department.id) {
      throw new BadRequestException(
        'Academic level does not belong to the selected department',
      );
    }

    // Check if matric number is already taken (if provided)
    if (dto.matricNumber) {
      const existing = await this.prisma.studentProfile.findFirst({
        where: {
          matricNumber: dto.matricNumber,
          NOT: { userId },
        },
      });
      if (existing) {
        throw new ConflictException('Matric number already registered');
      }
    }

    // Update or create StudentProfile
    const studentProfile = await this.prisma.studentProfile.upsert({
      where: { userId },
      update: {
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        currentAcademicLevelId: dto.levelId,
        matricNumber: dto.matricNumber,
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
      create: {
        userId: userId,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        currentAcademicLevelId: dto.levelId,
        matricNumber: dto.matricNumber,
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    });

    // Update UserProfile to COMPLETED
    const updatedProfile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    });

    // Log onboarding completion
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ONBOARDING_COMPLETED',
        details: JSON.stringify({
          step: 'INSTITUTION',
          completed: true,
          institutionId: dto.institutionId,
          facultyId: dto.facultyId,
          departmentId: dto.departmentId,
          levelId: dto.levelId,
          hasMatricNumber: !!dto.matricNumber,
        }),
      },
    });

    // Invalidate cache
    await this.invalidateOnboardingCache(userId);

    this.logger.log(`User ${userId} completed onboarding successfully`);

    return {
      message: 'Onboarding completed successfully! Welcome to Heightt 🎉',
      onboardingStep: 'COMPLETED',
      onboardingCompleted: true,
      profile: updatedProfile,
      studentProfile,
    };
  }

  // ============================================
  // GET ONBOARDING STATUS (with caching)
  // ============================================

  async getOnboardingStatus(userId: string) {
    // Check cache first
    const cacheKey = `onboarding:status:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Onboarding status found in cache for user: ${userId}`);
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('User or profile not found');
    }

    const personalInfoCompleted = !!(
      user.profile.firstName &&
      user.profile.lastName &&
      user.profile.phone &&
      user.profile.dateOfBirth
    );

    const institutionInfoCompleted = !!(
      user.studentProfile?.institutionId &&
      user.studentProfile?.facultyId &&
      user.studentProfile?.departmentId &&
      user.studentProfile?.currentAcademicLevelId
    );

    const status = {
      onboardingStep: user.profile.onboardingStep,
      onboardingCompleted: user.profile.onboardingCompleted,
      progress: {
        personalInfo: {
          completed: personalInfoCompleted,
          required: ['firstName', 'lastName', 'phone', 'dateOfBirth'],
          missing: this.getMissingPersonalFields(user.profile),
        },
        institutionInfo: {
          completed: institutionInfoCompleted,
          required: ['institution', 'faculty', 'department', 'level'],
          missing: this.getMissingInstitutionFields(user.studentProfile),
        },
      },
      hasStudentProfile: !!user.studentProfile,
      completedAt: user.profile.onboardingCompletedAt,
    };

    // Cache for 1 minute
    await this.cacheService.setWithTag(
      cacheKey,
      status,
      ['onboarding', 'user'],
      60,
    );

    return status;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getMissingPersonalFields(profile: any): string[] {
    const missing: string[] = [];
    if (!profile.firstName) missing.push('firstName');
    if (!profile.lastName) missing.push('lastName');
    if (!profile.phone) missing.push('phone');
    if (!profile.dateOfBirth) missing.push('dateOfBirth');
    if (!profile.gender) missing.push('gender');
    return missing;
  }

  private getMissingInstitutionFields(studentProfile: any): string[] {
    if (!studentProfile) {
      return ['institution', 'faculty', 'department', 'level'];
    }
    const missing: string[] = [];
    if (!studentProfile.institutionId) missing.push('institution');
    if (!studentProfile.facultyId) missing.push('faculty');
    if (!studentProfile.departmentId) missing.push('department');
    if (!studentProfile.currentAcademicLevelId) missing.push('level');
    return missing;
  }
}
