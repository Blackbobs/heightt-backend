// src/v1/students/students.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { PermissionService } from '../auth/permission.service';
import { WalletService } from '../finance/wallet.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  AddAcademicRecordDto,
  PromoteStudentDto,
} from './dto';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly permissionService: PermissionService,
    private readonly walletService: WalletService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateStudentsCache(studentId?: string): Promise<void> {
    try {
      // Invalidate all student tags
      await this.cacheService.invalidateByTag('students');
      await this.cacheService.invalidateByTag('dashboard');
      await this.cacheService.invalidateByTag('admin');
      await this.cacheService.invalidateByTag('academics');
      await this.cacheService.invalidateByTag('promotions');
      await this.cacheService.invalidateByTag('verifications');
      await this.cacheService.invalidateByTag('user');

      if (studentId) {
        // Invalidate specific student caches
        await this.cacheService.delete(`student:${studentId}`);
        await this.cacheService.delete(`student:academic-records:${studentId}`);
        await this.cacheService.delete(`student:promotions:${studentId}`);
        await this.cacheService.delete(`student:verifications:${studentId}`);
        await this.cacheService.invalidatePattern(`student:${studentId}:*`);

        // Get student to invalidate user cache
        const student = await this.prisma.studentProfile.findUnique({
          where: { id: studentId },
          select: { userId: true },
        });
        if (student) {
          await this.cacheService.delete(`student:user:${student.userId}`);
          await this.cacheService.delete(`student:dashboard:${student.userId}`);
          await this.cacheService.invalidateUserCache(student.userId);
        }
      }

      // Invalidate all patterns
      await this.cacheService.invalidatePattern('student:*');
      await this.cacheService.invalidatePattern('students:*');
      await this.cacheService.invalidatePattern('student:dashboard:*');

      this.logger.log(
        `Students cache invalidated${studentId ? ` for student: ${studentId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate students cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // STUDENT CRUD
  // ============================================

  async createStudent(userId: string, dto: CreateStudentDto) {
    this.logger.log(`Creating student for user: ${dto.userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.studentProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException('User already has a student profile');
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const faculty = await this.prisma.faculty.findUnique({
      where: { id: dto.facultyId },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }
    if (faculty.institutionId !== dto.institutionId) {
      throw new BadRequestException(
        'Faculty must belong to the selected institution',
      );
    }

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    if (department.facultyId !== dto.facultyId) {
      throw new BadRequestException(
        'Department must belong to the selected faculty',
      );
    }

    if (dto.currentAcademicLevelId) {
      const level = await this.prisma.academicLevel.findUnique({
        where: { id: dto.currentAcademicLevelId },
      });
      if (!level) {
        throw new NotFoundException('Academic level not found');
      }
      if (level.departmentId !== dto.departmentId) {
        throw new BadRequestException(
          'Academic level must belong to the selected department',
        );
      }
    }

    if (dto.matricNumber) {
      const existingMatric = await this.prisma.studentProfile.findFirst({
        where: { matricNumber: dto.matricNumber },
      });
      if (existingMatric) {
        throw new ConflictException('Matric number already exists');
      }
    }

    const student = await this.prisma.studentProfile.create({
      data: {
        userId: dto.userId,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        currentAcademicLevelId: dto.currentAcademicLevelId,
        matricNumber: dto.matricNumber,
        academicStatus: (dto.academicStatus as any) || 'ACTIVE',
        onboardingStep: 'COMPLETED',
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        verificationStatus: 'UNVERIFIED',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        currentAcademicLevel: true,
      },
    });

    // Create wallet for the student
    await this.walletService.getOrCreateWallet({
      type: 'USER',
      id: dto.userId,
    });

    // Invalidate cache
    await this.invalidateStudentsCache();

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'STUDENT_CREATED',
        details: JSON.stringify({
          studentId: student.id,
          userId: dto.userId,
          institutionId: dto.institutionId,
          departmentId: dto.departmentId,
        }),
      },
    });

    this.logger.log(`Student created: ${student.id}`);
    return student;
  }

  async getAllStudents(
    page: number = 1,
    limit: number = 10,
    filters?: {
      institutionId?: string;
      facultyId?: string;
      departmentId?: string;
      levelId?: string;
      status?: string;
      verificationStatus?: string;
      search?: string;
      academicStatus?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.institutionId) {
      where.institutionId = filters.institutionId;
    }
    if (filters?.facultyId) {
      where.facultyId = filters.facultyId;
    }
    if (filters?.departmentId) {
      where.departmentId = filters.departmentId;
    }
    if (filters?.levelId) {
      where.currentAcademicLevelId = filters.levelId;
    }
    if (filters?.status) {
      where.academicStatus = filters.status;
    }
    if (filters?.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }
    if (filters?.academicStatus) {
      where.academicStatus = filters.academicStatus;
    }
    if (filters?.search) {
      where.OR = [
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
        {
          user: { username: { contains: filters.search, mode: 'insensitive' } },
        },
        {
          user: {
            profile: {
              firstName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          user: {
            profile: {
              lastName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        { matricNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
          institution: true,
          faculty: true,
          department: true,
          currentAcademicLevel: true,
          academicRecords: {
            include: {
              session: true,
              department: true,
              academicLevel: true,
            },
            orderBy: { session: { startDate: 'desc' } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return {
      data: students,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStudentById(id: string, includeRelations: boolean = true) {
    const cacheKey = `student:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Student ${id} found in cache`);
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: includeRelations
        ? {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                profile: true,
              },
            },
            institution: true,
            faculty: true,
            department: true,
            currentAcademicLevel: true,
            academicRecords: {
              include: {
                session: true,
                department: true,
                academicLevel: true,
              },
              orderBy: { session: { startDate: 'desc' } },
            },
            promotions: {
              include: {
                fromLevel: true,
                toLevel: true,
                session: true,
              },
              orderBy: { promotionDate: 'desc' },
            },
            verifications: {
              orderBy: { requestedAt: 'desc' },
            },
          }
        : undefined,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    await this.cacheService.setWithTag(cacheKey, student, ['students'], 300);

    return student;
  }

  async getStudentByUserId(userId: string) {
    const cacheKey = `student:user:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        currentAcademicLevel: true,
        academicRecords: {
          include: {
            session: true,
            department: true,
            academicLevel: true,
          },
          orderBy: { session: { startDate: 'desc' } },
        },
        promotions: {
          include: {
            fromLevel: true,
            toLevel: true,
            session: true,
          },
          orderBy: { promotionDate: 'desc' },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      student,
      ['students', 'user'],
      120,
    );

    return student;
  }

  async updateStudent(id: string, userId: string, dto: UpdateStudentDto) {
    this.logger.log(`Updating student: ${id}`);

    const student = await this.prisma.studentProfile.findUnique({
      where: { id },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (dto.facultyId) {
      const faculty = await this.prisma.faculty.findUnique({
        where: { id: dto.facultyId },
      });
      if (!faculty) {
        throw new NotFoundException('Faculty not found');
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    if (dto.currentAcademicLevelId) {
      const level = await this.prisma.academicLevel.findUnique({
        where: { id: dto.currentAcademicLevelId },
      });
      if (!level) {
        throw new NotFoundException('Academic level not found');
      }
    }

    const updated = await this.prisma.studentProfile.update({
      where: { id },
      data: {
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        currentAcademicLevelId: dto.currentAcademicLevelId,
        matricNumber: dto.matricNumber,
        academicStatus: dto.academicStatus as any,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        currentAcademicLevel: true,
      },
    });

    // Invalidate cache
    await this.invalidateStudentsCache(id);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'STUDENT_UPDATED',
        details: JSON.stringify({
          studentId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Student updated: ${id}`);
    return updated;
  }

  // ============================================
  // ACADEMIC RECORDS
  // ============================================

  async addAcademicRecord(
    studentId: string,
    userId: string,
    dto: AddAcademicRecordDto,
  ) {
    this.logger.log(`Adding academic record for student: ${studentId}`);

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const level = await this.prisma.academicLevel.findUnique({
      where: { id: dto.academicLevelId },
    });
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    const existing = await this.prisma.studentAcademicRecord.findUnique({
      where: {
        studentId_sessionId: {
          studentId,
          sessionId: dto.sessionId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Academic record already exists for this session',
      );
    }

    const record = await this.prisma.studentAcademicRecord.create({
      data: {
        studentId,
        sessionId: dto.sessionId,
        departmentId: dto.departmentId,
        academicLevelId: dto.academicLevelId,
        gpa: dto.gpa,
        cgpa: dto.cgpa,
        creditsAttempted: dto.creditsAttempted,
        creditsEarned: dto.creditsEarned,
        status: (dto.status as any) || 'ACTIVE',
      },
      include: {
        session: true,
        department: true,
        academicLevel: true,
      },
    });

    if (dto.academicLevelId !== student.currentAcademicLevelId) {
      await this.prisma.studentProfile.update({
        where: { id: studentId },
        data: {
          currentAcademicLevelId: dto.academicLevelId,
        },
      });
    }

    // Invalidate cache
    await this.invalidateStudentsCache(studentId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_RECORD_ADDED',
        details: JSON.stringify({
          studentId,
          recordId: record.id,
          sessionId: dto.sessionId,
          gpa: dto.gpa,
          cgpa: dto.cgpa,
        }),
      },
    });

    this.logger.log(`Academic record added for student: ${studentId}`);
    return record;
  }

  async getAcademicRecords(studentId: string) {
    const cacheKey = `student:academic-records:${studentId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const records = await this.prisma.studentAcademicRecord.findMany({
      where: { studentId },
      include: {
        session: true,
        department: true,
        academicLevel: true,
      },
      orderBy: { session: { startDate: 'desc' } },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      records,
      ['students', 'academics'],
      300,
    );

    return records;
  }

  // ============================================
  // STUDENT PROMOTION
  // ============================================

  async promoteStudent(
    studentId: string,
    userId: string,
    dto: PromoteStudentDto,
  ) {
    this.logger.log(`Promoting student: ${studentId}`);

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const fromLevel = await this.prisma.academicLevel.findUnique({
      where: { id: dto.fromLevelId },
    });
    if (!fromLevel) {
      throw new NotFoundException('From level not found');
    }

    const toLevel = await this.prisma.academicLevel.findUnique({
      where: { id: dto.toLevelId },
    });
    if (!toLevel) {
      throw new NotFoundException('To level not found');
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    if (student.currentAcademicLevelId === dto.toLevelId) {
      throw new BadRequestException('Student is already at this level');
    }

    const promotion = await this.prisma.$transaction(async (tx) => {
      const promo = await tx.studentPromotion.create({
        data: {
          studentId,
          fromLevelId: dto.fromLevelId,
          toLevelId: dto.toLevelId,
          sessionId: dto.sessionId,
          promotedBy: userId,
          promotionDate: dto.promotionDate
            ? new Date(dto.promotionDate)
            : new Date(),
          notes: dto.notes,
        },
      });

      await tx.studentProfile.update({
        where: { id: studentId },
        data: {
          currentAcademicLevelId: dto.toLevelId,
        },
      });

      return promo;
    });

    // Invalidate cache
    await this.invalidateStudentsCache(studentId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'STUDENT_PROMOTED',
        details: JSON.stringify({
          studentId,
          fromLevelId: dto.fromLevelId,
          toLevelId: dto.toLevelId,
          sessionId: dto.sessionId,
        }),
      },
    });

    this.logger.log(`Student promoted: ${studentId}`);
    return promotion;
  }

  async getPromotionHistory(studentId: string) {
    const cacheKey = `student:promotions:${studentId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const promotions = await this.prisma.studentPromotion.findMany({
      where: { studentId },
      include: {
        fromLevel: true,
        toLevel: true,
        session: true,
      },
      orderBy: { promotionDate: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      promotions,
      ['students', 'promotions'],
      300,
    );

    return promotions;
  }

  // ============================================
  // STUDENT VERIFICATION
  // ============================================

  async requestVerification(
    studentId: string,
    userId: string,
    documentUrl?: string,
  ) {
    this.logger.log(`Requesting verification for student: ${studentId}`);

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const pending = await this.prisma.studentVerification.findFirst({
      where: {
        studentId,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new ConflictException(
        'There is already a pending verification request',
      );
    }

    const verification = await this.prisma.studentVerification.create({
      data: {
        studentId,
        status: 'PENDING',
        documentUrl,
        requestedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.invalidateStudentsCache(studentId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'STUDENT_VERIFICATION_REQUESTED',
        details: JSON.stringify({
          studentId,
          verificationId: verification.id,
        }),
      },
    });

    this.logger.log(`Verification requested for student: ${studentId}`);
    return verification;
  }

  async verifyStudent(
    verificationId: string,
    userId: string,
    status: string,
    notes?: string,
  ) {
    this.logger.log(`Verifying student verification: ${verificationId}`);

    const verification = await this.prisma.studentVerification.findUnique({
      where: { id: verificationId },
    });
    if (!verification) {
      throw new NotFoundException('Verification request not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const ver = await tx.studentVerification.update({
        where: { id: verificationId },
        data: {
          status: status as any,
          verifiedBy: userId,
          verifiedAt: new Date(),
          notes,
        },
      });

      if (status === 'VERIFIED') {
        await tx.studentProfile.update({
          where: { id: verification.studentId },
          data: {
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
          },
        });
      }

      return ver;
    });

    // Invalidate cache
    await this.invalidateStudentsCache(verification.studentId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'STUDENT_VERIFICATION_' + status.toUpperCase(),
        details: JSON.stringify({
          verificationId,
          studentId: verification.studentId,
          status,
          notes,
        }),
      },
    });

    this.logger.log(`Student verification ${status}: ${verificationId}`);
    return updated;
  }

  async getStudentVerifications(studentId: string) {
    const cacheKey = `student:verifications:${studentId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const verifications = await this.prisma.studentVerification.findMany({
      where: { studentId },
      orderBy: { requestedAt: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      verifications,
      ['students', 'verifications'],
      300,
    );

    return verifications;
  }

  // ============================================
  // STUDENT DASHBOARD
  // ============================================

  async getStudentDashboard(userId: string) {
    const cacheKey = `student:dashboard:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        currentAcademicLevel: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    const studentId = student.id;

    const records = await this.prisma.studentAcademicRecord.findMany({
      where: { studentId },
      include: {
        session: true,
        academicLevel: true,
      },
      orderBy: { session: { startDate: 'desc' } },
    });

    const latestRecord = records[0] || null;
    const totalCreditsAttempted = records.reduce(
      (sum, r) => sum + (r.creditsAttempted || 0),
      0,
    );
    const totalCreditsEarned = records.reduce(
      (sum, r) => sum + (r.creditsEarned || 0),
      0,
    );

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        organization: true,
      },
    });

    const upcomingDues = await this.prisma.dueAssignment.findMany({
      where: {
        studentId,
        isPaid: false,
        due: {
          status: 'ACTIVE',
        },
      },
      include: {
        due: {
          include: {
            organization: true,
          },
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    const recentAnnouncements = await this.prisma.announcement.findMany({
      where: {
        isPublished: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        organizationId: {
          in: memberships.map((m) => m.organizationId),
        },
      },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: {
        organization: true,
      },
    });

    const upcomingEvents = await this.prisma.event.findMany({
      where: {
        startDate: { gt: new Date() },
        status: 'PUBLISHED',
        organizationId: {
          in: memberships.map((m) => m.organizationId),
        },
      },
      take: 5,
      orderBy: { startDate: 'asc' },
      include: {
        organization: true,
      },
    });

    let totalUpcomingDues = 0;
    for (const d of upcomingDues) {
      totalUpcomingDues += Number(d.amount);
    }

    const dashboardData = {
      student: {
        id: student.id,
        name: student.user?.profile?.firstName
          ? `${student.user.profile.firstName} ${student.user.profile.lastName || ''}`
          : student.user?.username || 'Unknown',
        email: student.user?.email,
        username: student.user?.username,
        matricNumber: student.matricNumber,
        level: student.currentAcademicLevel?.name,
        department: student.department?.name,
        faculty: student.faculty?.name,
        institution: student.institution?.name,
      },
      academicSummary: {
        currentLevel: student.currentAcademicLevel?.name,
        currentGPA: latestRecord?.gpa,
        currentCGPA: latestRecord?.cgpa,
        totalCreditsAttempted,
        totalCreditsEarned,
        creditCompletionRate:
          totalCreditsAttempted > 0
            ? Math.round((totalCreditsEarned / totalCreditsAttempted) * 100)
            : 0,
        academicStatus: student.academicStatus,
        recordsCount: records.length,
      },
      organizations: {
        total: memberships.length,
        active: memberships.filter((m) => m.status === 'ACTIVE').length,
        list: memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          type: m.organization.type,
          membershipType: m.membershipType,
        })),
      },
      finances: {
        upcomingDues: upcomingDues.map((d) => ({
          id: d.id,
          dueId: d.dueId,
          amount: Number(d.amount),
          organization: d.due.organization?.name || 'Unknown',
        })),
        totalUpcomingDues,
      },
      recentAnnouncements: recentAnnouncements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        publishedAt: a.publishedAt,
        organization: a.organization?.name || 'Unknown',
        priority: a.priority,
      })),
      upcomingEvents: upcomingEvents.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        location: e.location,
        organization: e.organization?.name || 'Unknown',
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      dashboardData,
      ['students', 'dashboard'],
      120,
    );

    return dashboardData;
  }

  // ============================================
  // ADMIN DASHBOARD
  // ============================================

  async getAdminDashboard(institutionId?: string) {
    const cacheKey = `students:admin-dashboard:${institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [
      totalStudents,
      byStatus,
      byLevel,
      byDepartment,
      byInstitution,
      recentEnrollments,
      recentVerifications,
    ] = await Promise.all([
      this.prisma.studentProfile.count({ where }),
      this.prisma.studentProfile.groupBy({
        by: ['academicStatus'],
        where,
        _count: { id: true },
      }),
      this.prisma.studentProfile.groupBy({
        by: ['currentAcademicLevelId'],
        where,
        _count: { id: true },
      }),
      this.prisma.studentProfile.groupBy({
        by: ['departmentId'],
        where,
        _count: { id: true },
      }),
      this.prisma.studentProfile.groupBy({
        by: ['institutionId'],
        where,
        _count: { id: true },
      }),
      this.prisma.studentProfile.findMany({
        where: {
          ...where,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: true,
            },
          },
          department: true,
          currentAcademicLevel: true,
        },
      }),
      this.prisma.studentVerification.findMany({
        where: {
          status: 'PENDING',
        },
        take: 5,
        orderBy: { requestedAt: 'asc' },
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  profile: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const levelIds = byLevel
      .map((item) => item.currentAcademicLevelId)
      .filter(Boolean);
    const levels = await this.prisma.academicLevel.findMany({
      where: { id: { in: levelIds as string[] } },
      select: { id: true, name: true },
    });
    const levelMap: Record<string, string> = {};
    for (const level of levels) {
      levelMap[level.id] = level.name;
    }

    const deptIds = byDepartment
      .map((item) => item.departmentId)
      .filter(Boolean);
    const departments = await this.prisma.department.findMany({
      where: { id: { in: deptIds as string[] } },
      select: { id: true, name: true },
    });
    const deptMap: Record<string, string> = {};
    for (const dept of departments) {
      deptMap[dept.id] = dept.name;
    }

    const instIds = byInstitution
      .map((item) => item.institutionId)
      .filter(Boolean);
    const institutions = await this.prisma.institution.findMany({
      where: { id: { in: instIds as string[] } },
      select: { id: true, name: true },
    });
    const instMap: Record<string, string> = {};
    for (const inst of institutions) {
      instMap[inst.id] = inst.name;
    }

    const dashboardData = {
      statistics: {
        total: totalStudents,
        byStatus: byStatus.map((item) => ({
          status: item.academicStatus,
          count: item._count.id,
        })),
        byLevel: byLevel.map((item) => ({
          level: levelMap[item.currentAcademicLevelId as string] || 'Unknown',
          count: item._count.id,
        })),
        byDepartment: byDepartment.map((item) => ({
          department: deptMap[item.departmentId as string] || 'Unknown',
          count: item._count.id,
        })),
        byInstitution: byInstitution.map((item) => ({
          institution: instMap[item.institutionId as string] || 'Unknown',
          count: item._count.id,
        })),
      },
      recentEnrollments: recentEnrollments.map((s) => ({
        id: s.id,
        name: s.user?.profile?.firstName
          ? `${s.user.profile.firstName} ${s.user.profile.lastName || ''}`
          : s.user?.username || 'Unknown',
        email: s.user?.email,
        department: s.department?.name,
        level: s.currentAcademicLevel?.name,
        createdAt: s.createdAt,
      })),
      pendingVerifications: recentVerifications.map((v) => ({
        id: v.id,
        studentId: v.studentId,
        studentName: v.student?.user?.profile?.firstName
          ? `${v.student.user.profile.firstName} ${v.student.user.profile.lastName || ''}`
          : v.student?.user?.username || 'Unknown',
        studentEmail: v.student?.user?.email,
        requestedAt: v.requestedAt,
        documentUrl: v.documentUrl,
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      dashboardData,
      ['students', 'admin', 'dashboard'],
      300,
    );

    return dashboardData;
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  async bulkPromoteStudents(
    userId: string,
    promotions: Array<{
      studentId: string;
      fromLevelId: string;
      toLevelId: string;
      sessionId: string;
      notes?: string;
    }>,
  ) {
    this.logger.log(`Bulk promoting ${promotions.length} students`);

    const results: any[] = [];

    for (const promo of promotions) {
      try {
        const result = await this.promoteStudent(promo.studentId, userId, {
          fromLevelId: promo.fromLevelId,
          toLevelId: promo.toLevelId,
          sessionId: promo.sessionId,
          notes: promo.notes,
        });
        results.push({ success: true, studentId: promo.studentId, result });
      } catch (error) {
        results.push({
          success: false,
          studentId: promo.studentId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidateStudentsCache();

    this.logger.log(`Bulk promotion completed`);
    return results;
  }

  async bulkCreateStudents(userId: string, students: CreateStudentDto[]) {
    this.logger.log(`Bulk creating ${students.length} students`);

    const results: any[] = [];

    for (const student of students) {
      try {
        const result = await this.createStudent(userId, student);
        results.push({ success: true, userId: student.userId, result });
      } catch (error) {
        results.push({
          success: false,
          userId: student.userId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidateStudentsCache();

    this.logger.log(`Bulk student creation completed`);
    return results;
  }

  async exportStudents(filters?: {
    institutionId?: string;
    departmentId?: string;
    levelId?: string;
    status?: string;
  }) {
    const where: any = {};

    if (filters?.institutionId) {
      where.institutionId = filters.institutionId;
    }
    if (filters?.departmentId) {
      where.departmentId = filters.departmentId;
    }
    if (filters?.levelId) {
      where.currentAcademicLevelId = filters.levelId;
    }
    if (filters?.status) {
      where.academicStatus = filters.status;
    }

    const students = await this.prisma.studentProfile.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            username: true,
            profile: true,
          },
        },
        institution: true,
        faculty: true,
        department: true,
        currentAcademicLevel: true,
        academicRecords: {
          select: {
            gpa: true,
            cgpa: true,
            session: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { session: { startDate: 'desc' } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return students.map((s) => ({
      name: s.user?.profile?.firstName
        ? `${s.user.profile.firstName} ${s.user.profile.lastName || ''}`
        : s.user?.username || 'Unknown',
      email: s.user?.email,
      username: s.user?.username,
      matricNumber: s.matricNumber,
      institution: s.institution?.name,
      faculty: s.faculty?.name,
      department: s.department?.name,
      level: s.currentAcademicLevel?.name,
      status: s.academicStatus,
      gpa: s.academicRecords[0]?.gpa,
      cgpa: s.academicRecords[0]?.cgpa,
      createdAt: s.createdAt,
    }));
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getStudentStats(institutionId?: string) {
    const cacheKey = `students:stats:${institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [
      total,
      active,
      graduated,
      withdrawn,
      onProbation,
      verified,
      pendingVerification,
    ] = await Promise.all([
      this.prisma.studentProfile.count({ where }),
      this.prisma.studentProfile.count({
        where: { ...where, academicStatus: 'ACTIVE' },
      }),
      this.prisma.studentProfile.count({
        where: { ...where, academicStatus: 'GRADUATED' },
      }),
      this.prisma.studentProfile.count({
        where: { ...where, academicStatus: 'WITHDRAWN' },
      }),
      this.prisma.studentProfile.count({
        where: { ...where, academicStatus: 'PROBATION' },
      }),
      this.prisma.studentProfile.count({
        where: { ...where, verificationStatus: 'VERIFIED' },
      }),
      this.prisma.studentProfile.count({
        where: { ...where, verificationStatus: 'PENDING' },
      }),
    ]);

    const stats = {
      total,
      active,
      graduated,
      withdrawn,
      onProbation,
      verified,
      pendingVerification,
      completionRate: total > 0 ? Math.round((graduated / total) * 100) : 0,
      verificationRate: total > 0 ? Math.round((verified / total) * 100) : 0,
    };

    await this.cacheService.setWithTag(
      cacheKey,
      stats,
      ['students', 'stats'],
      600,
    );

    return stats;
  }
}
