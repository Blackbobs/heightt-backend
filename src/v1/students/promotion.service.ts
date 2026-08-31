// src/v1/students/promotion.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EventService, SystemEvents } from '../../events/event.service';
import { NotificationService } from '../communication/notification.service';
import {
  PromoteStudentDto,
  BulkPromoteDto,
  PromotionResultDto,
  PromoteInstitutionDto,
} from './dto/promotion.dto';

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
  ) {}

  async promoteInstitution(
    institutionId: string,
    userId: string,
    dto: PromoteInstitutionDto,
  ) {
    const [institution, currentSession, operator] = await Promise.all([
      this.prisma.institution.findUnique({ where: { id: institutionId } }),
      this.prisma.academicSession.findFirst({
        where: {
          id: dto.currentSessionId,
          institutionId,
          scope: 'INSTITUTION',
          isCurrent: true,
        },
      }),
      this.prisma.admin.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          OR: [
            { adminType: 'PLATFORM_ADMIN' },
            { adminType: 'INSTITUTION_ADMIN', institutionId },
          ],
        },
      }),
    ]);

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }
    if (!operator) {
      throw new ForbiddenException(
        'Only a platform admin or this institution admin can run promotion',
      );
    }
    if (!currentSession) {
      throw new BadRequestException(
        'The supplied session is not the institution current session. Refresh and try again.',
      );
    }

    const nextSessionName = this.getNextSessionName(currentSession.name);
    const existingNextSession = await this.prisma.academicSession.findFirst({
      where: {
        institutionId,
        name: nextSessionName,
        scope: 'INSTITUTION',
      },
    });
    const students = await this.prisma.studentProfile.findMany({
      where: { institutionId, academicStatus: 'ACTIVE' },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        currentAcademicLevelId: true,
      },
    });
    const departmentIds = [...new Set(students.map((s) => s.departmentId))];
    const levels = await this.prisma.academicLevel.findMany({
      where: {
        departmentId: { in: departmentIds },
        status: 'ACTIVE',
      },
      orderBy: [{ departmentId: 'asc' }, { order: 'asc' }],
    });
    const levelsByDepartment = new Map<string, typeof levels>();
    for (const level of levels) {
      const departmentLevels = levelsByDepartment.get(level.departmentId) || [];
      departmentLevels.push(level);
      levelsByDepartment.set(level.departmentId, departmentLevels);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const claimedCurrentSession = await tx.academicSession.updateMany({
        where: {
          id: currentSession.id,
          institutionId,
          scope: 'INSTITUTION',
          isCurrent: true,
        },
        data: { isCurrent: false, status: 'COMPLETED', updatedBy: userId },
      });
      if (claimedCurrentSession.count !== 1) {
        throw new BadRequestException(
          'This institution has already been promoted. Refresh before trying again.',
        );
      }

      const nextSession = existingNextSession
        ? await tx.academicSession.update({
            where: { id: existingNextSession.id },
            data: { isCurrent: true, status: 'ACTIVE', updatedBy: userId },
          })
        : await tx.academicSession.create({
            data: {
              institutionId,
              name: nextSessionName,
              startDate: this.addYears(currentSession.startDate, 1),
              endDate: this.addYears(currentSession.endDate, 1),
              status: 'ACTIVE',
              scope: 'INSTITUTION',
              isCurrent: true,
              createdBy: userId,
            },
          });

      await tx.academicSession.updateMany({
        where: {
          institutionId,
          scope: 'INSTITUTION',
          id: { not: nextSession.id },
          isCurrent: true,
        },
        data: { isCurrent: false, status: 'COMPLETED', updatedBy: userId },
      });

      let promoted = 0;
      let graduated = 0;
      let skipped = 0;

      for (const student of students) {
        if (!student.currentAcademicLevelId) {
          skipped += 1;
          continue;
        }
        const departmentLevels =
          levelsByDepartment.get(student.departmentId) || [];
        const currentIndex = departmentLevels.findIndex(
          (level) => level.id === student.currentAcademicLevelId,
        );
        if (currentIndex < 0) {
          skipped += 1;
          continue;
        }
        const nextLevel = departmentLevels[currentIndex + 1];

        if (!nextLevel) {
          await tx.studentProfile.update({
            where: { id: student.id },
            data: { academicStatus: 'GRADUATED' },
          });
          graduated += 1;
          continue;
        }

        await tx.studentPromotion.create({
          data: {
            studentId: student.id,
            fromLevelId: student.currentAcademicLevelId,
            toLevelId: nextLevel.id,
            sessionId: nextSession.id,
            promotedBy: userId,
            promotionDate: now,
            notes: dto.notes || `Institution promotion to ${nextSession.name}`,
          },
        });
        await tx.studentProfile.update({
          where: { id: student.id },
          data: { currentAcademicLevelId: nextLevel.id },
        });
        await tx.studentAcademicRecord.upsert({
          where: {
            studentId_sessionId: {
              studentId: student.id,
              sessionId: nextSession.id,
            },
          },
          update: {
            departmentId: student.departmentId,
            academicLevelId: nextLevel.id,
            status: 'ACTIVE',
          },
          create: {
            studentId: student.id,
            sessionId: nextSession.id,
            departmentId: student.departmentId,
            academicLevelId: nextLevel.id,
            status: 'ACTIVE',
          },
        });
        promoted += 1;
      }

      await tx.activityLog.create({
        data: {
          userId,
          activity: 'INSTITUTION_STUDENTS_PROMOTED',
          details: JSON.stringify({
            institutionId,
            fromSessionId: currentSession.id,
            fromSessionName: currentSession.name,
            toSessionId: nextSession.id,
            toSessionName: nextSession.name,
            promoted,
            graduated,
            skipped,
          }),
        },
      });

      return {
        institution: { id: institution.id, name: institution.name },
        previousSession: {
          id: currentSession.id,
          name: currentSession.name,
        },
        currentSession: {
          id: nextSession.id,
          name: nextSession.name,
          generated: !existingNextSession,
        },
        summary: {
          eligible: students.length,
          promoted,
          graduated,
          skipped,
        },
      };
    });

    await Promise.all([
      this.invalidatePromotionCache(),
      this.cacheService.invalidateByTag('sessions'),
    ]);

    return result;
  }

  private getNextSessionName(currentName: string): string {
    const match = currentName.trim().match(/^(\d{4})\s*\/\s*(\d{4})$/);
    if (!match) {
      throw new BadRequestException(
        'Current session name must use the YYYY/YYYY format',
      );
    }
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (endYear !== startYear + 1) {
      throw new BadRequestException(
        'Current session years must be consecutive',
      );
    }
    return `${startYear + 1}/${endYear + 1}`;
  }

  private addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setUTCFullYear(result.getUTCFullYear() + years);
    return result;
  }

  // ============================================
  // PROMOTE STUDENT
  // ============================================

  async promoteStudent(
    studentId: string,
    userId: string,
    dto: PromoteStudentDto,
  ) {
    this.logger.log(`Promoting student: ${studentId}`);

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true },
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

    // Validate levels belong to same department
    if (fromLevel.departmentId !== toLevel.departmentId) {
      throw new BadRequestException(
        'Levels must belong to the same department',
      );
    }

    // Check if student is already at this level
    if (student.currentAcademicLevelId === dto.toLevelId) {
      throw new BadRequestException('Student is already at this level');
    }

    // Validate from level matches student's current level
    if (student.currentAcademicLevelId !== dto.fromLevelId) {
      throw new BadRequestException(
        'Student is not currently in the specified from level',
      );
    }

    // Check if promotion already exists for this session
    const existingPromotion = await this.prisma.studentPromotion.findFirst({
      where: {
        studentId,
        sessionId: dto.sessionId,
        fromLevelId: dto.fromLevelId,
        toLevelId: dto.toLevelId,
      },
    });

    if (existingPromotion) {
      throw new BadRequestException(
        'Student already has a promotion record for this session',
      );
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

      // Update student's current level
      await tx.studentProfile.update({
        where: { id: studentId },
        data: {
          currentAcademicLevelId: dto.toLevelId,
        },
      });

      return promo;
    });

    // Invalidate cache
    await this.invalidatePromotionCache(studentId);

    // Log activity
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

    // Emit event
    this.eventService.emitStudentPromoted({
      studentId,
      userId: student.userId,
      fromLevelId: dto.fromLevelId,
      toLevelId: dto.toLevelId,
      promotionDate: promotion.promotionDate,
    });

    // Send notification
    await this.notificationService.createNotification(student.userId, {
      title: '🎓 Promotion Confirmed!',
      body: `Congratulations! You have been promoted from ${fromLevel.name} to ${toLevel.name}.`,
      type: 'ACADEMIC',
      priority: 'NORMAL',
      data: {
        studentId,
        fromLevelId: dto.fromLevelId,
        toLevelId: dto.toLevelId,
        sessionId: dto.sessionId,
        promotionId: promotion.id,
      },
      sendEmail: true,
    });

    this.logger.log(`Student promoted: ${studentId}`);
    return promotion;
  }

  // ============================================
  // BULK PROMOTE STUDENTS
  // ============================================

  async bulkPromoteStudents(
    userId: string,
    dto: BulkPromoteDto,
  ): Promise<{ results: PromotionResultDto[]; summary: any }> {
    this.logger.log(`Bulk promoting students`);

    const fromLevel = await this.prisma.academicLevel.findUnique({
      where: { id: dto.fromLevelId },
      include: { department: true },
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

    // Validate levels belong to same department
    if (fromLevel.departmentId !== toLevel.departmentId) {
      throw new BadRequestException(
        'Levels must belong to the same department',
      );
    }

    // Get students to promote
    let studentIds = dto.studentIds || [];

    if (dto.promoteAll || studentIds.length === 0) {
      const students = await this.prisma.studentProfile.findMany({
        where: {
          currentAcademicLevelId: dto.fromLevelId,
          ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
        },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    }

    if (studentIds.length === 0) {
      throw new BadRequestException('No students found to promote');
    }

    // Filter out students who already have promotion for this session
    const existingPromotions = await this.prisma.studentPromotion.findMany({
      where: {
        studentId: { in: studentIds },
        sessionId: dto.sessionId,
        fromLevelId: dto.fromLevelId,
        toLevelId: dto.toLevelId,
      },
      select: { studentId: true },
    });

    const existingStudentIds = new Set(
      existingPromotions.map((p) => p.studentId),
    );
    const filteredStudentIds = studentIds.filter(
      (id) => !existingStudentIds.has(id),
    );

    if (filteredStudentIds.length === 0) {
      throw new BadRequestException(
        'All selected students already have promotion records for this session',
      );
    }

    const results: PromotionResultDto[] = [];

    for (const studentId of filteredStudentIds) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const promotion = await tx.studentPromotion.create({
            data: {
              studentId,
              fromLevelId: dto.fromLevelId,
              toLevelId: dto.toLevelId,
              sessionId: dto.sessionId,
              promotedBy: userId,
              promotionDate: new Date(),
              notes: dto.notes || 'Bulk promotion',
            },
          });

          await tx.studentProfile.update({
            where: { id: studentId },
            data: {
              currentAcademicLevelId: dto.toLevelId,
            },
          });

          return promotion;
        });

        results.push({
          success: true,
          studentId,
          promotionId: result.id,
        });

        // Send notification to student
        const student = await this.prisma.studentProfile.findUnique({
          where: { id: studentId },
          include: { user: true },
        });

        if (student) {
          await this.notificationService.createNotification(student.userId, {
            title: '🎓 Promotion Confirmed!',
            body: `You have been promoted from ${fromLevel.name} to ${toLevel.name}.`,
            type: 'ACADEMIC',
            priority: 'NORMAL',
            data: {
              studentId,
              fromLevelId: dto.fromLevelId,
              toLevelId: dto.toLevelId,
              sessionId: dto.sessionId,
              promotionId: result.id,
            },
            sendEmail: true,
          });
        }
      } catch (error) {
        results.push({
          success: false,
          studentId,
          error: error.message,
        });
      }
    }

    // Invalidate cache
    await this.invalidatePromotionCache();

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'BULK_STUDENT_PROMOTION',
        details: JSON.stringify({
          fromLevelId: dto.fromLevelId,
          toLevelId: dto.toLevelId,
          sessionId: dto.sessionId,
          totalAttempted: filteredStudentIds.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        }),
      },
    });

    this.logger.log(
      `Bulk promotion completed: ${filteredStudentIds.length} students`,
    );

    return {
      results,
      summary: {
        totalAttempted: filteredStudentIds.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        fromLevel: fromLevel.name,
        toLevel: toLevel.name,
        session: session.name,
      },
    };
  }

  // ============================================
  // GET PROMOTION HISTORY
  // ============================================

  async getPromotionHistory(
    studentId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const cacheKey = `student:promotions:${studentId}:${page}:${limit}`;
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

    const skip = (page - 1) * limit;
    const [promotions, total] = await Promise.all([
      this.prisma.studentPromotion.findMany({
        where: { studentId },
        include: {
          fromLevel: true,
          toLevel: true,
          session: true,
        },
        skip,
        take: limit,
        orderBy: { promotionDate: 'desc' },
      }),
      this.prisma.studentPromotion.count({ where: { studentId } }),
    ]);

    const result = {
      data: promotions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cacheService.setWithTag(
      cacheKey,
      result,
      ['students', 'promotions'],
      300,
    );

    return result;
  }

  // ============================================
  // GET ELIGIBLE STUDENTS
  // ============================================

  async getEligibleStudents(
    fromLevelId: string,
    departmentId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const fromLevel = await this.prisma.academicLevel.findUnique({
      where: { id: fromLevelId },
    });
    if (!fromLevel) {
      throw new NotFoundException('Level not found');
    }

    const where: any = {
      currentAcademicLevelId: fromLevelId,
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const skip = (page - 1) * limit;
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
          department: true,
        },
        orderBy: {
          user: {
            profile: {
              firstName: 'asc',
            },
          },
        },
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

  // ============================================
  // CACHE INVALIDATION
  // ============================================

  async invalidatePromotionCache(studentId?: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTag('promotions');
      await this.cacheService.invalidateByTag('students');

      if (studentId) {
        await this.cacheService.invalidatePattern(
          `student:promotions:${studentId}:*`,
        );
        await this.cacheService.delete(`student:${studentId}`);
      }

      this.logger.debug(
        `Promotion cache invalidated${studentId ? ` for student: ${studentId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate promotion cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // PROMOTION STATISTICS
  // ============================================

  async getPromotionStats(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [totalPromotions, byLevel, bySession, recentPromotions] =
      await Promise.all([
        this.prisma.studentPromotion.count({
          where: {
            student: where,
          },
        }),
        this.prisma.studentPromotion.groupBy({
          by: ['toLevelId'],
          where: {
            student: where,
          },
          _count: { id: true },
        }),
        this.prisma.studentPromotion.groupBy({
          by: ['sessionId'],
          where: {
            student: where,
          },
          _count: { id: true },
          orderBy: { sessionId: 'asc' },
          take: 5,
        }),
        this.prisma.studentPromotion.findMany({
          where: {
            student: where,
          },
          include: {
            fromLevel: true,
            toLevel: true,
            session: true,
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: true,
                  },
                },
              },
            },
          },
          orderBy: { promotionDate: 'desc' },
          take: 10,
        }),
      ]);

    // Get level names
    const levelIds = byLevel.map((item) => item.toLevelId);
    const levels = await this.prisma.academicLevel.findMany({
      where: { id: { in: levelIds } },
      select: { id: true, name: true },
    });
    const levelMap = new Map(levels.map((l) => [l.id, l.name]));

    // Get session names
    const sessionIds = bySession.map((item) => item.sessionId);
    const sessions = await this.prisma.academicSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, name: true },
    });
    const sessionMap = new Map(sessions.map((s) => [s.id, s.name]));

    return {
      totalPromotions,
      byLevel: byLevel.map((item) => ({
        level: levelMap.get(item.toLevelId) || 'Unknown',
        count: item._count.id,
      })),
      bySession: bySession.map((item) => ({
        session: sessionMap.get(item.sessionId) || 'Unknown',
        count: item._count.id,
      })),
      recentPromotions: recentPromotions.map((p) => ({
        id: p.id,
        student: p.student.user?.username || 'Unknown',
        studentName: p.student.user?.profile?.firstName
          ? `${p.student.user.profile.firstName} ${p.student.user.profile.lastName || ''}`
          : 'Unknown',
        fromLevel: p.fromLevel?.name,
        toLevel: p.toLevel?.name,
        session: p.session?.name,
        promotionDate: p.promotionDate,
      })),
    };
  }
}
