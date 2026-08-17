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
  // COMPLETE ONBOARDING (with simple text inputs)
  // ============================================

  async completeOnboarding(
    userId: string,
    body: {
      phone?: string;
      studentId?: string;
      institution?: string;
      faculty?: string;
      department?: string;
      organizationId?: string;
      membershipType?: string;
    },
  ) {
    this.logger.log(`Completing onboarding for user: ${userId}`);

    // Update user profile with onboarding data
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        phone: body.phone,
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    });

    // If institution info is provided, update student profile
    if (body.institution && body.faculty && body.department) {
      // Find or create institution
      let institution = await this.prisma.institution.findFirst({
        where: { name: body.institution },
      });

      if (!institution) {
        institution = await this.prisma.institution.create({
          data: {
            name: body.institution,
            shortName: body.institution.substring(0, 10),
            code: body.institution.substring(0, 10).toUpperCase(),
            status: 'ACTIVE',
          },
        });
      }

      // Find or create faculty
      let faculty = await this.prisma.faculty.findFirst({
        where: {
          name: body.faculty,
          institutionId: institution.id,
        },
      });

      if (!faculty) {
        faculty = await this.prisma.faculty.create({
          data: {
            name: body.faculty,
            code: body.faculty.substring(0, 10).toUpperCase(),
            institutionId: institution.id,
            status: 'ACTIVE',
          },
        });
      }

      // Find or create department
      let department = await this.prisma.department.findFirst({
        where: {
          name: body.department,
          facultyId: faculty.id,
        },
      });

      if (!department) {
        department = await this.prisma.department.create({
          data: {
            name: body.department,
            code: body.department.substring(0, 10).toUpperCase(),
            facultyId: faculty.id,
            promotionType: 'AUTOMATIC',
            status: 'ACTIVE',
          },
        });
      }

      // Update or create student profile
      await this.prisma.studentProfile.upsert({
        where: { userId },
        update: {
          institutionId: institution.id,
          facultyId: faculty.id,
          departmentId: department.id,
          onboardingStep: 'COMPLETED',
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
        },
        create: {
          userId,
          institutionId: institution.id,
          facultyId: faculty.id,
          departmentId: department.id,
          matricNumber: body.studentId || '',
          onboardingStep: 'COMPLETED',
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
        },
      });
      // Auto-join matching institutional organizations
      await this.autoJoinInstitutionalOrganizations(
        userId,
        institution.id,
        faculty.id,
        department.id,
      );
    }

    // If explicit organization is provided, directly join
    if (body.organizationId) {
      // Check if organization exists and is active
      const organization = await this.prisma.organization.findUnique({
        where: { id: body.organizationId },
      });

      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      if (organization.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Organization is not active and cannot accept new members',
        );
      }

      // Check if user is already a member
      const existingMembership = await this.prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: body.organizationId,
            userId,
          },
        },
      });

      if (!existingMembership) {
        // Directly create active membership (No pending request needed)
        await this.prisma.organizationMembership.create({
          data: {
            organizationId: body.organizationId,
            userId,
            membershipType: (body.membershipType as any) || 'STUDENT',
            status: 'ACTIVE',
            joinedAt: new Date(),
            isPrimary: true,
          },
        });

        // Record approved join request for history
        await this.prisma.organizationJoinRequest.upsert({
          where: {
            organizationId_userId: {
              organizationId: body.organizationId,
              userId,
            },
          },
          update: {
            status: 'APPROVED',
            reviewedAt: new Date(),
          },
          create: {
            organizationId: body.organizationId,
            userId,
            membershipType: (body.membershipType as any) || 'STUDENT',
            status: 'APPROVED',
            reviewedAt: new Date(),
            message: 'Direct join during onboarding',
          },
        });

        this.logger.log(
          `User ${userId} directly joined organization ${body.organizationId} during onboarding`,
        );
      } else {
        this.logger.log(
          `User ${userId} is already a member of organization ${body.organizationId}`,
        );
      }
    }

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ONBOARDING_COMPLETED',
        details: JSON.stringify({
          phone: body.phone,
          institution: body.institution,
          faculty: body.faculty,
          department: body.department,
          organizationId: body.organizationId,
        }),
      },
    });

    // Invalidate cache
    await this.invalidateOnboardingCache(userId);

    return {
      message: 'Onboarding completed successfully',
      onboardingCompleted: true,
      hasJoinRequest: !!body.organizationId,
    };
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

    // Auto-join matching institutional organizations directly
    await this.autoJoinInstitutionalOrganizations(
      userId,
      dto.institutionId,
      dto.facultyId,
      dto.departmentId,
      dto.levelId,
    );

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

  private async autoJoinInstitutionalOrganizations(
    userId: string,
    institutionId: string,
    facultyId?: string,
    departmentId?: string,
    levelId?: string,
  ) {
    try {
      const orConditions: any[] = [{ scope: 'INSTITUTION' }];
      if (facultyId) orConditions.push({ scope: 'FACULTY', facultyId });
      if (departmentId) orConditions.push({ scope: 'DEPARTMENT', departmentId });
      if (levelId) orConditions.push({ scope: 'LEVEL', academicLevelId: levelId });

      const matchingOrgs = await this.prisma.organization.findMany({
        where: {
          institutionId,
          OR: orConditions,
          status: 'ACTIVE',
        },
      });

      for (const org of matchingOrgs) {
        const existing = await this.prisma.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: org.id,
              userId,
            },
          },
        });

        if (!existing) {
          await this.prisma.organizationMembership.create({
            data: {
              organizationId: org.id,
              userId,
              membershipType: 'STUDENT',
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          });

          await this.prisma.organizationJoinRequest.upsert({
            where: {
              organizationId_userId: {
                organizationId: org.id,
                userId,
              },
            },
            update: {
              status: 'APPROVED',
              reviewedAt: new Date(),
            },
            create: {
              organizationId: org.id,
              userId,
              membershipType: 'STUDENT',
              status: 'APPROVED',
              reviewedAt: new Date(),
              message: 'Auto-joined during onboarding',
            },
          });

          this.logger.log(
            `User ${userId} auto-joined organization ${org.name} (${org.id}) during onboarding`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to auto-join institutional orgs for user ${userId}: ${error.message}`,
      );
    }
  }

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