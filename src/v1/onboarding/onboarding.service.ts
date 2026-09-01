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
import {
  CompleteOnboardingDto,
  OnboardingPersonalInfoDto,
  OnboardingInstitutionDto,
} from './dto';

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
      await this.cacheService.invalidateByTag('onboarding');
      await this.cacheService.invalidateByTag('user');
      await this.cacheService.invalidateByTag('organizations');
      await this.cacheService.invalidateByTag('members');
      await this.cacheService.invalidateByTag('dashboard');
      await this.cacheService.delete(`onboarding:status:${userId}`);
      await this.cacheService.invalidateUserCache(userId);
      this.logger.debug(`Onboarding cache invalidated for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate onboarding cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // COMPLETE ONBOARDING (with Transaction)
  // ============================================

  async completeOnboarding(userId: string, body: CompleteOnboardingDto) {
    this.logger.log(`Completing onboarding for user: ${userId}`);

    // NEW: Validate session if provided
    let session: any = null;
    if (body.sessionId) {
      session = await this.prisma.academicSession.findUnique({
        where: { id: body.sessionId },
      });
      if (!session) {
        throw new BadRequestException('Academic session not found');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update user profile
      const updatedProfile = await tx.userProfile.update({
        where: { userId },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          gender: body.gender as any,
          country: body.country,
          onboardingStep: 'INSTITUTION',
        },
      });

      let studentProfile = null as any;
      let academicLevelId = body.academicLevelId;
      let institution: any = null;
      let faculty: any = null;
      let department: any = null;

      if (body.institution && body.faculty && body.department) {
        // Find or create institution
        institution = await tx.institution.findFirst({
          where: { name: body.institution },
        });

        if (!institution) {
          institution = await tx.institution.create({
            data: {
              name: body.institution,
              shortName: body.institution.substring(0, 10),
              code: body.institution.substring(0, 10).toUpperCase(),
              status: 'ACTIVE',
            },
          });
        }

        // NEW: Validate session belongs to institution
        if (session && session.institutionId !== institution.id) {
          throw new BadRequestException(
            'Session does not belong to the selected institution',
          );
        }

        // Find or create faculty
        faculty = await tx.faculty.findFirst({
          where: {
            name: body.faculty,
            institutionId: institution.id,
          },
        });

        if (!faculty) {
          faculty = await tx.faculty.create({
            data: {
              name: body.faculty,
              code: body.faculty.substring(0, 10).toUpperCase(),
              institutionId: institution.id,
              status: 'ACTIVE',
            },
          });
        }

        // Find or create department
        department = await tx.department.findFirst({
          where: {
            name: body.department,
            facultyId: faculty.id,
          },
        });

        if (!department) {
          department = await tx.department.create({
            data: {
              name: body.department,
              code: body.department.substring(0, 10).toUpperCase(),
              facultyId: faculty.id,
              promotionType: 'AUTOMATIC',
              status: 'ACTIVE',
            },
          });
        }

        // Find or create academic level
        if (body.academicLevelId) {
          let level = await tx.academicLevel.findUnique({
            where: { id: body.academicLevelId },
          });

          if (!level) {
            const numericLevel = parseInt(body.academicLevelId) || 100;
            const levelName = `${numericLevel} Level`;

            level = await tx.academicLevel.findFirst({
              where: {
                departmentId: department.id,
                name: levelName,
              },
            });

            if (!level) {
              const createdLevel = await tx.academicLevel.create({
                data: {
                  name: levelName,
                  numericLevel,
                  order: numericLevel / 100,
                  departmentId: department.id,
                  status: 'ACTIVE',
                },
              });
              academicLevelId = createdLevel.id;
            } else {
              academicLevelId = level.id;
            }
          } else {
            academicLevelId = level.id;
          }
        } else {
          const defaultLevel = await tx.academicLevel.findFirst({
            where: {
              departmentId: department.id,
              numericLevel: 100,
            },
          });
          if (defaultLevel) {
            academicLevelId = defaultLevel.id;
          }
        }

        // Create or update student profile
        studentProfile = await tx.studentProfile.upsert({
          where: { userId },
          update: {
            institutionId: institution.id,
            facultyId: faculty.id,
            departmentId: department.id,
            currentAcademicLevelId: academicLevelId,
            matricNumber: body.studentId || '',
            onboardingStep: 'COMPLETED',
            onboardingCompleted: true,
            onboardingCompletedAt: new Date(),
          },
          create: {
            userId,
            institutionId: institution.id,
            facultyId: faculty.id,
            departmentId: department.id,
            currentAcademicLevelId: academicLevelId,
            matricNumber: body.studentId || '',
            onboardingStep: 'COMPLETED',
            onboardingCompleted: true,
            onboardingCompletedAt: new Date(),
          },
        });

        // NEW: Create academic record for the session
        if (session && academicLevelId) {
          await tx.studentAcademicRecord.create({
            data: {
              studentId: studentProfile.id,
              sessionId: session.id,
              departmentId: department.id,
              academicLevelId: academicLevelId,
              status: 'ACTIVE',
            },
          });
          this.logger.log(
            `Academic record created for student ${studentProfile.id} in session ${session.id}`,
          );
        }

        // Auto-join institutional organizations
        await this.autoJoinInstitutionalOrganizationsInTransaction(
          tx,
          userId,
          institution.id,
          faculty.id,
          department.id,
          academicLevelId,
          session?.id,
        );
      }

      // Mark onboarding as completed
      const finalProfile = await tx.userProfile.update({
        where: { userId },
        data: {
          onboardingStep: 'COMPLETED',
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'ONBOARDING_COMPLETED',
          details: JSON.stringify({
            firstName: body.firstName,
            lastName: body.lastName,
            gender: body.gender,
            country: body.country,
            institution: body.institution,
            faculty: body.faculty,
            department: body.department,
            academicLevelId: body.academicLevelId,
            sessionId: body.sessionId,
          }),
        },
      });

      return {
        profile: finalProfile,
        studentProfile,
      };
    });

    await this.invalidateOnboardingCache(userId);

    this.logger.log(`Onboarding completed successfully for user: ${userId}`);

    return {
      message: 'Onboarding completed successfully',
      onboardingCompleted: true,
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

    // Update UserProfile
    const updatedProfile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        avatar: dto.avatar,
        gender: dto.gender as any,
        country: dto.country,
        onboardingStep: 'INSTITUTION',
      },
    });

    if (user.studentProfile) {
      await this.prisma.studentProfile.update({
        where: { userId },
        data: {
          onboardingStep: 'INSTITUTION',
        },
      });
    }

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ONBOARDING_PERSONAL_INFO',
        details: JSON.stringify({
          step: 'PERSONAL_INFO',
          completed: true,
          fields: ['firstName', 'lastName', 'gender', 'country'],
        }),
      },
    });

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

    const { studentProfile, updatedProfile } = await this.prisma.$transaction(
      async (tx) => {
        const completedAt = new Date();
        const studentProfile = await tx.studentProfile.upsert({
          where: { userId },
          update: {
            institutionId: dto.institutionId,
            facultyId: dto.facultyId,
            departmentId: dto.departmentId,
            currentAcademicLevelId: dto.levelId,
            matricNumber: dto.matricNumber,
            onboardingStep: 'COMPLETED',
            onboardingCompleted: true,
            onboardingCompletedAt: completedAt,
          },
          create: {
            userId,
            institutionId: dto.institutionId,
            facultyId: dto.facultyId,
            departmentId: dto.departmentId,
            currentAcademicLevelId: dto.levelId,
            matricNumber: dto.matricNumber,
            onboardingStep: 'COMPLETED',
            onboardingCompleted: true,
            onboardingCompletedAt: completedAt,
          },
        });

        const updatedProfile = await tx.userProfile.update({
          where: { userId },
          data: {
            onboardingStep: 'COMPLETED',
            onboardingCompleted: true,
            onboardingCompletedAt: completedAt,
          },
        });

        await this.autoJoinInstitutionalOrganizationsInTransaction(
          tx,
          userId,
          dto.institutionId,
          dto.facultyId,
          dto.departmentId,
          dto.levelId,
        );

        await tx.activityLog.create({
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

        return { studentProfile, updatedProfile };
      },
    );

    await this.invalidateOnboardingCache(userId);

    this.logger.log(`User ${userId} completed onboarding successfully`);

    return {
      message: 'Onboarding completed successfully! Welcome to Heightt',
      onboardingStep: 'COMPLETED',
      onboardingCompleted: true,
      profile: updatedProfile,
      studentProfile,
    };
  }

  // ============================================
  // GET ONBOARDING STATUS (with consistency fix)
  // ============================================

  async getOnboardingStatus(userId: string) {
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
      user.profile.gender
    );

    const institutionInfoCompleted = !!(
      user.studentProfile?.institutionId &&
      user.studentProfile?.facultyId &&
      user.studentProfile?.departmentId &&
      user.studentProfile?.currentAcademicLevelId
    );

    // ============================================
    // CRITICAL: Fix inconsistency if profile says completed but student profile doesn't exist
    // ============================================
    if (user.profile.onboardingCompleted && !institutionInfoCompleted) {
      this.logger.warn(
        `Onboarding inconsistency detected for user ${userId}. Profile says completed but student profile is incomplete. Fixing...`,
      );

      // Fix the inconsistency by updating the profile
      await this.prisma.userProfile.update({
        where: { userId },
        data: {
          onboardingCompleted: false,
          onboardingStep: 'INSTITUTION',
        },
      });

      // Invalidate cache since we fixed the inconsistency
      await this.cacheService.delete(cacheKey);

      // Update the user object for the response
      user.profile.onboardingCompleted = false;
      user.profile.onboardingStep = 'INSTITUTION';
    }

    // ============================================
    // Onboarding is ONLY completed if BOTH are true
    // ============================================
    const onboardingCompleted =
      personalInfoCompleted && institutionInfoCompleted;

    const status = {
      onboardingStep: user.profile.onboardingStep,
      onboardingCompleted: onboardingCompleted,
      progress: {
        personalInfo: {
          completed: personalInfoCompleted,
          required: ['firstName', 'lastName', 'gender'],
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

  /**
   * Auto-join institutional organizations within a transaction
   */
  private async autoJoinInstitutionalOrganizationsInTransaction(
    tx: any,
    userId: string,
    institutionId: string,
    facultyId?: string,
    departmentId?: string,
    academicLevelId?: string,
    sessionId?: string,
  ) {
    if (!sessionId) {
      const currentSession = await tx.academicSession.findFirst({
        where: {
          institutionId,
          scope: 'INSTITUTION',
          isCurrent: true,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      sessionId = currentSession?.id;
    }

    const organizationScopes: any[] = [
      { type: 'INSTITUTION', scope: 'INSTITUTION' },
    ];
    if (facultyId) {
      organizationScopes.push({
        type: 'FACULTY',
        scope: 'FACULTY',
        facultyId,
      });
    }
    if (departmentId) {
      organizationScopes.push({
        type: 'DEPARTMENT',
        scope: 'DEPARTMENT',
        departmentId,
      });
    }
    if (academicLevelId) {
      organizationScopes.push({
        type: 'LEVEL',
        scope: 'LEVEL',
        academicLevelId,
      });
    }

    const matchingOrgs = await tx.organization.findMany({
      where: {
        institutionId,
        status: 'ACTIVE',
        AND: [
          { OR: organizationScopes },
          {
            OR: sessionId
              ? [{ academicSessionId: null }, { academicSessionId: sessionId }]
              : [{ academicSessionId: null }],
          },
        ],
      },
      select: { id: true, name: true, type: true, academicSessionId: true },
    });

    const selectedOrganizations = new Map<
      string,
      (typeof matchingOrgs)[number]
    >();
    for (const organization of matchingOrgs) {
      const selected = selectedOrganizations.get(organization.type);
      if (
        !selected ||
        (organization.academicSessionId === sessionId &&
          selected.academicSessionId !== sessionId)
      ) {
        selectedOrganizations.set(organization.type, organization);
      }
    }

    if (selectedOrganizations.size > 0) {
      await tx.organizationMembership.updateMany({
        where: {
          userId,
          membershipType: 'STUDENT',
          status: 'ACTIVE',
          organization: {
            type: { in: ['INSTITUTION', 'FACULTY', 'DEPARTMENT', 'LEVEL'] },
          },
        },
        data: { status: 'LEFT', leftAt: new Date() },
      });
    }

    for (const org of selectedOrganizations.values()) {
      await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId,
          },
        },
        update: {
          membershipType: 'STUDENT',
          status: 'ACTIVE',
          leftAt: null,
          joinedSessionId: org.academicSessionId || sessionId || null,
        },
        create: {
          organizationId: org.id,
          userId,
          membershipType: 'STUDENT',
          status: 'ACTIVE',
          isPrimary: org.type === 'INSTITUTION',
          joinedAt: new Date(),
          joinedSessionId: org.academicSessionId || sessionId || null,
        },
      });

      await tx.organizationJoinRequest.upsert({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId,
          },
        },
        update: {
          membershipType: 'STUDENT',
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

  private getMissingPersonalFields(profile: any): string[] {
    const missing: string[] = [];
    if (!profile.firstName) missing.push('firstName');
    if (!profile.lastName) missing.push('lastName');
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
