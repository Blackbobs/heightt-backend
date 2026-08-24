// src/v1/institutions/institutions.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { FinanceService } from '../finance/finance.service';
import { WalletService } from '../finance/wallet.service';
import {
  CreateInstitutionDto,
  UpdateInstitutionDto,
  CreateFacultyDto,
  UpdateFacultyDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateAcademicLevelDto,
  CreateAcademicSessionDto,
  SessionScope,
} from './dto';

interface LevelData {
  name: string;
  numericLevel: number;
  order: number;
}

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly financeService: FinanceService,
    private readonly walletService: WalletService,
  ) {}

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateInstitutionsCache(institutionId?: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTag('institutions');
      await this.cacheService.invalidateByTag('faculties');
      await this.cacheService.invalidateByTag('departments');
      await this.cacheService.invalidateByTag('academic-levels');
      await this.cacheService.invalidateByTag('sessions');
      await this.cacheService.invalidateByTag('organizations');

      if (institutionId) {
        await this.cacheService.delete(`institution:${institutionId}`);
        await this.cacheService.invalidatePattern(
          `faculties:institution:${institutionId}`,
        );
        await this.cacheService.invalidatePattern(
          `sessions:institution:${institutionId}`,
        );
        await this.cacheService.invalidatePattern(
          `institutions:*:${institutionId}:*`,
        );
      }

      await this.cacheService.invalidatePattern('institution:*');
      await this.cacheService.invalidatePattern('faculty:*');
      await this.cacheService.invalidatePattern('department:*');
      await this.cacheService.invalidatePattern('academic-level:*');
      await this.cacheService.invalidatePattern('session:*');
      await this.cacheService.invalidatePattern('faculties:*');
      await this.cacheService.invalidatePattern('departments:*');
      await this.cacheService.invalidatePattern('academic-levels:*');
      await this.cacheService.invalidatePattern('sessions:*');
      await this.cacheService.invalidatePattern('organization:*');

      this.logger.log(
        `Institutions cache invalidated${institutionId ? ` for institution: ${institutionId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate institutions cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  generateDefaultSessionName(): string {
    const currentYear = new Date().getFullYear();
    return `${currentYear}/${currentYear + 1}`;
  }

  async getOrCreateDefaultSession(institutionId: string, userId: string) {
    const existingSessions = await this.prisma.academicSession.findMany({
      where: {
        institutionId,
        status: { in: ['ACTIVE', 'UPCOMING'] },
      },
      orderBy: { startDate: 'desc' },
    });

    if (existingSessions.length > 0) {
      return existingSessions[0];
    }

    const defaultName = this.generateDefaultSessionName();
    const currentYear = new Date().getFullYear();

    const defaultSession = await this.prisma.academicSession.create({
      data: {
        name: defaultName,
        startDate: new Date(`${currentYear}-09-01`),
        endDate: new Date(`${currentYear + 1}-08-31`),
        institutionId,
        status: 'ACTIVE',
        isCurrent: true,
        createdBy: userId,
      },
    });

    this.logger.log(
      `Default academic session created for institution ${institutionId}: ${defaultSession.name}`,
    );

    return defaultSession;
  }

  async validateSessionNameUnique(
    institutionId: string,
    name: string,
    excludeId?: string,
  ) {
    const where: any = {
      institutionId,
      name,
    };
    if (excludeId) {
      where.id = { not: excludeId };
    }

    const existing = await this.prisma.academicSession.findFirst({
      where,
    });

    if (existing) {
      throw new ConflictException(
        `Academic session "${name}" already exists for this institution`,
      );
    }
  }

  async createAcademicSession(userId: string, dto: CreateAcademicSessionDto) {
    this.logger.log(`Creating academic session: ${dto.name}`);

    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    let faculty: any = null;
    if (dto.facultyId) {
      faculty = await this.prisma.faculty.findUnique({
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
    }

    let department: any = null;
    if (dto.departmentId) {
      department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        include: { faculty: true },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
      if (dto.facultyId && department.facultyId !== dto.facultyId) {
        throw new BadRequestException(
          'Department must belong to the selected faculty',
        );
      }
      if (!dto.facultyId) {
        dto.facultyId = department.facultyId;
      }
    }

    let academicLevel: any = null;
    if (dto.academicLevelId) {
      academicLevel = await this.prisma.academicLevel.findUnique({
        where: { id: dto.academicLevelId },
        include: { department: true },
      });
      if (!academicLevel) {
        throw new NotFoundException('Academic level not found');
      }
      if (dto.departmentId && academicLevel.departmentId !== dto.departmentId) {
        throw new BadRequestException(
          'Academic level must belong to the selected department',
        );
      }
      if (!dto.departmentId) {
        dto.departmentId = academicLevel.departmentId;
        const dept = await this.prisma.department.findUnique({
          where: { id: academicLevel.departmentId },
          select: { facultyId: true },
        });
        if (dept) {
          dto.facultyId = dept.facultyId;
        }
      }
    }

    let scope = SessionScope.INSTITUTION;
    if (dto.academicLevelId) {
      scope = SessionScope.LEVEL;
    } else if (dto.departmentId) {
      scope = SessionScope.DEPARTMENT;
    } else if (dto.facultyId) {
      scope = SessionScope.FACULTY;
    }

    const where: any = {
      institutionId: dto.institutionId,
      name: dto.name,
    };
    if (dto.facultyId) where.facultyId = dto.facultyId;
    if (dto.departmentId) where.departmentId = dto.departmentId;
    if (dto.academicLevelId) where.academicLevelId = dto.academicLevelId;

    const existing = await this.prisma.academicSession.findFirst({
      where,
    });

    if (existing) {
      throw new ConflictException(
        `Academic session "${dto.name}" already exists at this level`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate >= endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    if (dto.isCurrent) {
      const currentWhere: any = {
        institutionId: dto.institutionId,
        isCurrent: true,
      };
      if (dto.facultyId) currentWhere.facultyId = dto.facultyId;
      if (dto.departmentId) currentWhere.departmentId = dto.departmentId;
      if (dto.academicLevelId)
        currentWhere.academicLevelId = dto.academicLevelId;

      await this.prisma.academicSession.updateMany({
        where: currentWhere,
        data: { isCurrent: false },
      });
    }

    const session = await this.prisma.academicSession.create({
      data: {
        name: dto.name,
        startDate,
        endDate,
        status: (dto.status as any) || 'UPCOMING',
        isCurrent: dto.isCurrent || false,
        institutionId: dto.institutionId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        academicLevelId: dto.academicLevelId,
        scope,
        createdBy: userId,
      },
      include: {
        institution: true,
      },
    });

    await this.invalidateInstitutionsCache(dto.institutionId);
    if (dto.facultyId) {
      await this.cacheService.invalidatePattern(
        `sessions:faculty:${dto.facultyId}`,
      );
    }
    if (dto.departmentId) {
      await this.cacheService.invalidatePattern(
        `sessions:department:${dto.departmentId}`,
      );
    }
    if (dto.academicLevelId) {
      await this.cacheService.invalidatePattern(
        `sessions:level:${dto.academicLevelId}`,
      );
    }

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_SESSION_CREATED',
        details: JSON.stringify({
          sessionId: session.id,
          name: session.name,
          institutionId: dto.institutionId,
          facultyId: dto.facultyId,
          departmentId: dto.departmentId,
          academicLevelId: dto.academicLevelId,
          scope,
        }),
      },
    });

    this.logger.log(`Academic session created: ${session.id} (${scope})`);
    return session;
  }

  async updateAcademicSession(
    id: string,
    userId: string,
    dto: Partial<CreateAcademicSessionDto>,
  ) {
    this.logger.log(`Updating academic session: ${id}`);

    const session = await this.prisma.academicSession.findUnique({
      where: { id },
      include: { institution: true },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    if (dto.facultyId) {
      const faculty = await this.prisma.faculty.findUnique({
        where: { id: dto.facultyId },
      });
      if (!faculty) {
        throw new NotFoundException('Faculty not found');
      }
      if (faculty.institutionId !== session.institutionId) {
        throw new BadRequestException(
          'Faculty must belong to the same institution',
        );
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
      if (dto.facultyId && department.facultyId !== dto.facultyId) {
        throw new BadRequestException(
          'Department must belong to the selected faculty',
        );
      }
    }

    if (dto.academicLevelId) {
      const level = await this.prisma.academicLevel.findUnique({
        where: { id: dto.academicLevelId },
      });
      if (!level) {
        throw new NotFoundException('Academic level not found');
      }
      if (dto.departmentId && level.departmentId !== dto.departmentId) {
        throw new BadRequestException(
          'Academic level must belong to the selected department',
        );
      }
    }

    if (dto.name && dto.name !== session.name) {
      const where: any = {
        institutionId: session.institutionId,
        name: dto.name,
        NOT: { id },
      };
      if (dto.facultyId || session.facultyId) {
        where.facultyId = dto.facultyId || session.facultyId;
      }
      if (dto.departmentId || session.departmentId) {
        where.departmentId = dto.departmentId || session.departmentId;
      }
      if (dto.academicLevelId || session.academicLevelId) {
        where.academicLevelId = dto.academicLevelId || session.academicLevelId;
      }

      const existing = await this.prisma.academicSession.findFirst({ where });
      if (existing) {
        throw new ConflictException(
          'Academic session name already exists at this level',
        );
      }
    }

    if (dto.isCurrent) {
      const currentWhere: any = {
        institutionId: session.institutionId,
        isCurrent: true,
        NOT: { id },
      };
      if (dto.facultyId || session.facultyId) {
        currentWhere.facultyId = dto.facultyId || session.facultyId;
      }
      if (dto.departmentId || session.departmentId) {
        currentWhere.departmentId = dto.departmentId || session.departmentId;
      }
      if (dto.academicLevelId || session.academicLevelId) {
        currentWhere.academicLevelId =
          dto.academicLevelId || session.academicLevelId;
      }

      await this.prisma.academicSession.updateMany({
        where: currentWhere,
        data: { isCurrent: false },
      });
    }

    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    data.updatedBy = userId;

    const updated = await this.prisma.academicSession.update({
      where: { id },
      data,
      include: {
        institution: true,
        faculty: true,
        department: true,
        academicLevel: true,
      },
    });

    await this.invalidateInstitutionsCache(session.institutionId);
    await this.cacheService.delete(`session:${id}`);
    await this.cacheService.invalidatePattern('sessions:*');

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_SESSION_UPDATED',
        details: JSON.stringify({
          sessionId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Academic session updated: ${id}`);
    return updated;
  }

  async deleteAcademicSession(id: string, userId: string) {
    this.logger.log(`Deleting academic session: ${id}`);

    const session = await this.prisma.academicSession.findUnique({
      where: { id },
      include: {
        dues: true,
        studentRecords: true,
        promotions: true,
        organizations: true,
        memberships: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    if (
      session.dues.length > 0 ||
      session.studentRecords.length > 0 ||
      session.promotions.length > 0 ||
      session.organizations.length > 0 ||
      session.memberships.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete academic session with associated records. Archive instead.',
      );
    }

    const deleted = await this.prisma.academicSession.delete({
      where: { id },
    });

    await this.invalidateInstitutionsCache(session.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_SESSION_DELETED',
        details: JSON.stringify({
          sessionId: id,
          name: session.name,
          institutionId: session.institutionId,
        }),
      },
    });

    this.logger.log(`Academic session deleted: ${id}`);
    return deleted;
  }

  async getSessionsByInstitution(institutionId: string) {
    const cacheKey = `sessions:institution:${institutionId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        institutionId,
        facultyId: null,
      },
      include: {
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      sessions,
      ['institutions', 'sessions'],
      600,
    );

    return sessions;
  }

  async getSessionsByFaculty(facultyId: string) {
    const cacheKey = `sessions:faculty:${facultyId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const faculty = await this.prisma.faculty.findUnique({
      where: { id: facultyId },
      include: { institution: true },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        facultyId,
        departmentId: null,
      },
      include: {
        institution: true,
        department: true,
        academicLevel: true,
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      sessions,
      ['institutions', 'sessions', 'faculties'],
      600,
    );

    return sessions;
  }

  async getSessionsByDepartment(departmentId: string) {
    const cacheKey = `sessions:department:${departmentId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { faculty: { include: { institution: true } } },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        departmentId,
        academicLevelId: null,
      },
      include: {
        institution: true,
        faculty: true,
        academicLevel: true,
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      sessions,
      ['institutions', 'sessions', 'departments'],
      600,
    );

    return sessions;
  }

  async getSessionsByLevel(academicLevelId: string) {
    const cacheKey = `sessions:level:${academicLevelId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const level = await this.prisma.academicLevel.findUnique({
      where: { id: academicLevelId },
      include: {
        department: {
          include: { faculty: { include: { institution: true } } },
        },
      },
    });
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        academicLevelId,
      },
      include: {
        institution: true,
        faculty: true,
        department: true,
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      sessions,
      ['institutions', 'sessions', 'academic-levels'],
      600,
    );

    return sessions;
  }

  async getDepartmentSessionsWithLevels(departmentId: string) {
    const cacheKey = `sessions:department:${departmentId}:with-levels`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        faculty: { include: { institution: true } },
        academicLevels: true,
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        OR: [
          { departmentId },
          {
            academicLevelId: { in: department.academicLevels.map((l) => l.id) },
          },
        ],
      },
      include: {
        institution: true,
        faculty: true,
        department: true,
        academicLevel: true,
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: [{ scope: 'desc' }, { startDate: 'desc' }],
    });

    const grouped = {
      departmentLevel: sessions.filter((s) => s.scope === 'DEPARTMENT'),
      byLevel: department.academicLevels.map((level) => ({
        level,
        sessions: sessions.filter((s) => s.academicLevelId === level.id),
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      grouped,
      ['institutions', 'sessions', 'departments'],
      600,
    );

    return grouped;
  }

  async getAcademicSessionById(id: string) {
    const cacheKey = `session:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { id },
      include: {
        institution: true,
        organizations: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      session,
      ['institutions', 'sessions'],
      600,
    );

    return session;
  }

  async getAcademicSessionStats(sessionId: string) {
    const cacheKey = `session:stats:${sessionId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { id: sessionId },
      include: {
        institution: true,
        organizations: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            memberships: {
              where: { status: 'ACTIVE' },
              select: { id: true },
            },
          },
        },
        studentRecords: {
          select: { studentId: true },
        },
        dues: true,
        promotions: true,
        memberships: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    const organizationStats = {
      total: session.organizations.length,
      byType: session.organizations.reduce((acc: any, org) => {
        acc[org.type] = (acc[org.type] || 0) + 1;
        return acc;
      }, {}),
      active: session.organizations.filter((o) => o.status === 'ACTIVE').length,
    };

    const stats = {
      id: session.id,
      name: session.name,
      status: session.status,
      isCurrent: session.isCurrent,
      startDate: session.startDate,
      endDate: session.endDate,
      institutionName: session.institution.name,
      studentCount: session.studentRecords.length,
      dueCount: session.dues.length,
      promotionCount: session.promotions.length,
      membershipCount: session.memberships.length,
      organizationStats,
    };

    await this.cacheService.setWithTag(
      cacheKey,
      stats,
      ['institutions', 'sessions', 'stats'],
      300,
    );

    return stats;
  }

  async getStudentsBySession(
    sessionId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const session = await this.prisma.academicSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.studentAcademicRecord.findMany({
        where: { sessionId },
        skip,
        take: limit,
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
              department: true,
              currentAcademicLevel: true,
            },
          },
          academicLevel: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentAcademicRecord.count({
        where: { sessionId },
      }),
    ]);

    return {
      data: records,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrganizationsBySession(
    sessionId: string,
    type?: string,
    status?: string,
  ) {
    const where: any = {
      academicSessionId: sessionId,
    };
    if (type) {
      where.type = type;
    }
    if (status) {
      where.status = status;
    }

    const organizations = await this.prisma.organization.findMany({
      where,
      include: {
        institution: true,
        faculty: true,
        department: true,
        academicLevel: true,
        academicSession: true,
        memberships: {
          where: { status: 'ACTIVE' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });

    return organizations;
  }

  // ============================================
  // INSTITUTION CRUD
  // ============================================

  async createInstitution(userId: string, dto: CreateInstitutionDto) {
    this.logger.log(`Creating institution: ${dto.name}`);

    if (!dto.sessions || dto.sessions.length === 0) {
      throw new BadRequestException(
        'At least one academic session is required when creating an institution',
      );
    }

    const existingCode = await this.prisma.institution.findUnique({
      where: { code: dto.code },
    });
    if (existingCode) {
      throw new ConflictException('Institution code already exists');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Fix: Provide default empty string for optional fields
      const institution = await tx.institution.create({
        data: {
          name: dto.name,
          shortName: dto.shortName || '',
          code: dto.code,
          logo: dto.logo || null,
          website: dto.website || null,
          email: dto.email || null,
          phone: dto.phone || null,
          address: dto.address || null,
          city: dto.city || null,
          state: dto.state || null,
          country: dto.country || null,
          createdBy: userId,
          status: 'ACTIVE',
        },
      });

      const createdSessions: any[] = [];
      // Fix: Add null check for sessions
      if (dto.sessions && dto.sessions.length > 0) {
        for (const sessionDto of dto.sessions) {
          const sessionNameRegex = /^[0-9]{4}\/[0-9]{4}$/;
          if (!sessionNameRegex.test(sessionDto.name)) {
            throw new BadRequestException(
              `Session name "${sessionDto.name}" must be in the format YYYY/YYYY (e.g., 2026/2027)`,
            );
          }

          const existingSession = await tx.academicSession.findFirst({
            where: {
              institutionId: institution.id,
              name: sessionDto.name,
            },
          });
          if (existingSession) {
            throw new ConflictException(
              `Session "${sessionDto.name}" already exists for this institution`,
            );
          }

          const startDate = new Date(sessionDto.startDate);
          const endDate = new Date(sessionDto.endDate);
          if (startDate >= endDate) {
            throw new BadRequestException(
              `Start date must be before end date for session ${sessionDto.name}`,
            );
          }

          if (sessionDto.isCurrent) {
            await tx.academicSession.updateMany({
              where: {
                institutionId: institution.id,
                isCurrent: true,
              },
              data: { isCurrent: false },
            });
          }

          const session = await tx.academicSession.create({
            data: {
              name: sessionDto.name,
              startDate,
              endDate,
              status: (sessionDto.status as any) || 'UPCOMING',
              isCurrent: sessionDto.isCurrent || false,
              institutionId: institution.id,
              createdBy: userId,
            },
          });
          createdSessions.push(session);
        }
      }

      const instOrgSlug = `${dto.code.toLowerCase()}-institution`;
      const existingInstOrg = await tx.organization.findFirst({
        where: {
          slug: instOrgSlug,
          institutionId: institution.id,
        },
      });

      if (!existingInstOrg) {
        try {
          const instOrg = await tx.organization.create({
            data: {
              name: `${institution.name}`,
              slug: instOrgSlug,
              description: `Institution organization for ${institution.name}`,
              type: 'INSTITUTION',
              scope: 'INSTITUTION',
              institutionId: institution.id,
              createdBy: userId,
              status: 'ACTIVE',
            },
          });
          this.logger.log(`Institution organization created: ${instOrg.id}`);

          try {
            await this.walletService.getOrCreateWallet({
              type: 'ORGANIZATION',
              id: instOrg.id,
            });
            this.logger.log(
              `Wallet created for institution organization: ${instOrg.id}`,
            );
          } catch (walletError) {
            this.logger.warn(
              `Failed to create wallet for institution organization ${instOrg.id}: ${walletError.message}`,
            );
          }
        } catch (orgError) {
          this.logger.warn(
            `Failed to create organization for institution ${institution.id}: ${orgError.message}`,
          );
        }
      }

      return { institution, sessions: createdSessions };
    });

    await this.invalidateInstitutionsCache(result.institution.id);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'INSTITUTION_CREATED',
        details: JSON.stringify({
          institutionId: result.institution.id,
          name: result.institution.name,
          code: result.institution.code,
          sessionsCreated: result.sessions.length,
          sessions: result.sessions.map((s) => s.name),
        }),
      },
    });

    this.logger.log(
      `Institution created: ${result.institution.id} with ${result.sessions.length} sessions`,
    );

    return {
      ...result.institution,
      sessions: result.sessions,
    };
  }

  async getAllInstitutions(
    page: number = 1,
    limit: number = 10,
    filters?: { status?: string; search?: string },
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
        { shortName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [institutions, total] = await Promise.all([
      this.prisma.institution.findMany({
        where,
        skip,
        take: limit,
        include: {
          faculties: {
            include: {
              departments: {
                include: {
                  academicLevels: true,
                },
              },
            },
          },
          sessions: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.institution.count({ where }),
    ]);

    return {
      data: institutions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getInstitutionById(id: string, includeRelations: boolean = true) {
    const cacheKey = `institution:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Institution ${id} found in cache`);
      return cached;
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: includeRelations
        ? {
            faculties: {
              include: {
                departments: {
                  include: {
                    academicLevels: true,
                  },
                },
              },
            },
            sessions: true,
            organizations: {
              take: 5,
              where: { status: 'ACTIVE' },
            },
          }
        : undefined,
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      institution,
      ['institutions'],
      600,
    );

    return institution;
  }

  async updateInstitution(
    id: string,
    userId: string,
    dto: UpdateInstitutionDto,
  ) {
    this.logger.log(`Updating institution: ${id}`);

    const institution = await this.prisma.institution.findUnique({
      where: { id },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (dto.code && dto.code !== institution.code) {
      const existingCode = await this.prisma.institution.findUnique({
        where: { code: dto.code },
      });
      if (existingCode) {
        throw new ConflictException('Institution code already exists');
      }
    }

    const updated = await this.prisma.institution.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        status: dto.status as any,
      },
    });

    await this.invalidateInstitutionsCache(id);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'INSTITUTION_UPDATED',
        details: JSON.stringify({
          institutionId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Institution updated: ${id}`);
    return updated;
  }

  async deleteInstitution(id: string, userId: string) {
    this.logger.log(`Deleting institution: ${id}`);

    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: {
        faculties: true,
        sessions: true,
        organizations: true,
      },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (
      institution.faculties.length > 0 ||
      institution.sessions.length > 0 ||
      institution.organizations.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete institution with existing faculties, sessions, or organizations. Archive instead.',
      );
    }

    const deleted = await this.prisma.institution.delete({
      where: { id },
    });

    await this.invalidateInstitutionsCache(id);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'INSTITUTION_DELETED',
        details: JSON.stringify({
          institutionId: id,
          name: institution.name,
          code: institution.code,
        }),
      },
    });

    this.logger.log(`Institution deleted: ${id}`);
    return deleted;
  }

  async getInstitutionStats(institutionId: string) {
    const cacheKey = `institution:stats:${institutionId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const [
      totalFaculties,
      totalDepartments,
      totalAcademicLevels,
      totalStudents,
      totalOrganizations,
      activeOrganizations,
      totalSessions,
      activeSessions,
    ] = await Promise.all([
      this.prisma.faculty.count({ where: { institutionId } }),
      this.prisma.department.count({
        where: { faculty: { institutionId } },
      }),
      this.prisma.academicLevel.count({
        where: { department: { faculty: { institutionId } } },
      }),
      this.prisma.studentProfile.count({ where: { institutionId } }),
      this.prisma.organization.count({ where: { institutionId } }),
      this.prisma.organization.count({
        where: { institutionId, status: 'ACTIVE' },
      }),
      this.prisma.academicSession.count({ where: { institutionId } }),
      this.prisma.academicSession.count({
        where: { institutionId, status: 'ACTIVE' },
      }),
    ]);

    const stats = {
      institutionId,
      institutionName: institution.name,
      totalFaculties,
      totalDepartments,
      totalAcademicLevels,
      totalStudents,
      totalOrganizations,
      activeOrganizations,
      inactiveOrganizations: totalOrganizations - activeOrganizations,
      totalSessions,
      activeSessions,
    };

    await this.cacheService.setWithTag(
      cacheKey,
      stats,
      ['institutions', 'stats'],
      900,
    );

    return stats;
  }

  // ============================================
  // FACULTY CRUD
  // ============================================

  async createFaculty(userId: string, dto: CreateFacultyDto) {
    this.logger.log(`Creating faculty: ${dto.name}`);

    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const existing = await this.prisma.faculty.findFirst({
      where: {
        institutionId: dto.institutionId,
        code: dto.code,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Faculty code already exists in this institution',
      );
    }

    const faculty = await this.prisma.faculty.create({
      data: {
        name: dto.name,
        code: dto.code,
        logo: dto.logo || null,
        institutionId: dto.institutionId,
        createdBy: userId,
        status: 'ACTIVE',
      },
    });

    const facultyOrgSlug = `${dto.code.toLowerCase()}-faculty`;
    const existingFacultyOrg = await this.prisma.organization.findFirst({
      where: {
        slug: facultyOrgSlug,
        institutionId: dto.institutionId,
      },
    });

    if (!existingFacultyOrg) {
      try {
        const facultyOrg = await this.prisma.organization.create({
          data: {
            name: `${faculty.name}`,
            slug: facultyOrgSlug,
            description: `Faculty organization for ${faculty.name}`,
            type: 'FACULTY',
            scope: 'FACULTY',
            institutionId: dto.institutionId,
            facultyId: faculty.id,
            createdBy: userId,
            status: 'ACTIVE',
          },
        });
        this.logger.log(`Faculty organization created: ${facultyOrg.id}`);

        try {
          await this.walletService.getOrCreateWallet({
            type: 'ORGANIZATION',
            id: facultyOrg.id,
          });
          this.logger.log(
            `Wallet created for faculty organization: ${facultyOrg.id}`,
          );
        } catch (walletError) {
          this.logger.warn(
            `Failed to create wallet for faculty organization ${facultyOrg.id}: ${walletError.message}`,
          );
        }
      } catch (orgError) {
        this.logger.warn(
          `Failed to create organization for faculty ${faculty.id}: ${orgError.message}`,
        );
      }
    }

    await this.invalidateInstitutionsCache(dto.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'FACULTY_CREATED',
        details: JSON.stringify({
          facultyId: faculty.id,
          name: faculty.name,
          code: faculty.code,
          institutionId: dto.institutionId,
        }),
      },
    });

    this.logger.log(`Faculty created: ${faculty.id}`);
    return faculty;
  }

  async getFacultiesByInstitution(institutionId: string) {
    const cacheKey = `faculties:institution:${institutionId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const faculties = await this.prisma.faculty.findMany({
      where: { institutionId },
      include: {
        departments: {
          include: {
            academicLevels: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      faculties,
      ['institutions', 'faculties'],
      600,
    );

    return faculties;
  }

  async getFacultyById(id: string) {
    const cacheKey = `faculty:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const faculty = await this.prisma.faculty.findUnique({
      where: { id },
      include: {
        institution: true,
        departments: {
          include: {
            academicLevels: true,
          },
        },
      },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      faculty,
      ['institutions', 'faculties'],
      600,
    );

    return faculty;
  }

  async updateFaculty(id: string, userId: string, dto: UpdateFacultyDto) {
    this.logger.log(`Updating faculty: ${id}`);

    const faculty = await this.prisma.faculty.findUnique({
      where: { id },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    const updated = await this.prisma.faculty.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        status: dto.status as any,
      },
    });

    await this.invalidateInstitutionsCache(faculty.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'FACULTY_UPDATED',
        details: JSON.stringify({
          facultyId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Faculty updated: ${id}`);
    return updated;
  }

  async deleteFaculty(id: string, userId: string) {
    this.logger.log(`Deleting faculty: ${id}`);

    const faculty = await this.prisma.faculty.findUnique({
      where: { id },
      include: {
        departments: true,
      },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    if (faculty.departments.length > 0) {
      throw new BadRequestException(
        'Cannot delete faculty with existing departments. Archive instead.',
      );
    }

    const deleted = await this.prisma.faculty.delete({
      where: { id },
    });

    await this.invalidateInstitutionsCache(faculty.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'FACULTY_DELETED',
        details: JSON.stringify({
          facultyId: id,
          name: faculty.name,
          institutionId: faculty.institutionId,
        }),
      },
    });

    this.logger.log(`Faculty deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // DEPARTMENT CRUD WITH SESSION-BASED ORGANIZATIONS
  // ============================================

  private getDefaultLevelCount(departmentName: string): number {
    const name = departmentName.toLowerCase();

    const fiveYearPrograms = [
      'engineering',
      'law',
      'architecture',
      'pharmacy',
      'veterinary',
      'agriculture',
    ];

    if (fiveYearPrograms.some((program) => name.includes(program))) {
      return 5;
    }

    const sixYearPrograms = ['medicine', 'surgery', 'dentistry'];
    if (sixYearPrograms.some((program) => name.includes(program))) {
      return 6;
    }

    return 4;
  }

  private generateAcademicLevels(
    numberOfLevels: number,
    customLevelNames?: string[],
  ): LevelData[] {
    const levels: LevelData[] = [];

    if (customLevelNames && customLevelNames.length === numberOfLevels) {
      for (let i = 0; i < customLevelNames.length; i++) {
        levels.push({
          name: customLevelNames[i],
          numericLevel: (i + 1) * 100,
          order: i + 1,
        });
      }
      return levels;
    }

    const standardLevelNames = [
      '100 Level',
      '200 Level',
      '300 Level',
      '400 Level',
      '500 Level',
      '600 Level',
      '700 Level',
      '800 Level',
      '900 Level',
      '1000 Level',
    ];

    for (let i = 0; i < numberOfLevels; i++) {
      const levelNumber = (i + 1) * 100;
      const name =
        customLevelNames?.[i] ||
        standardLevelNames[i] ||
        `${levelNumber} Level`;

      levels.push({
        name,
        numericLevel: levelNumber,
        order: i + 1,
      });
    }

    return levels;
  }

  async createDepartment(userId: string, dto: CreateDepartmentDto) {
    this.logger.log(`Creating department: ${dto.name}`);

    const faculty = await this.prisma.faculty.findUnique({
      where: { id: dto.facultyId },
      include: {
        institution: true,
      },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    const existing = await this.prisma.department.findFirst({
      where: {
        facultyId: dto.facultyId,
        code: dto.code,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Department code already exists in this faculty',
      );
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        code: dto.code,
        logo: dto.logo || null,
        facultyId: dto.facultyId,
        promotionType: (dto.promotionType as any) || 'AUTOMATIC',
        createdBy: userId,
        status: 'ACTIVE',
      },
    });

    this.logger.log(`Department created: ${department.id}`);

    const numberOfLevels =
      dto.numberOfLevels || this.getDefaultLevelCount(dto.name);

    const levels: LevelData[] = this.generateAcademicLevels(
      numberOfLevels,
      dto.customLevelNames,
    );

    this.logger.log(
      `Generating ${levels.length} levels for department: ${department.name}`,
    );

    const defaultSession = await this.getOrCreateDefaultSession(
      faculty.institutionId,
      userId,
    );

    const sessions = [defaultSession];

    const createdLevels: any[] = [];
    const createdOrganizations: any[] = [];

    for (const session of sessions) {
      for (const level of levels) {
        let createdLevel = await this.prisma.academicLevel.findFirst({
          where: {
            departmentId: department.id,
            name: level.name,
          },
        });

        if (!createdLevel) {
          createdLevel = await this.prisma.academicLevel.create({
            data: {
              name: level.name,
              numericLevel: level.numericLevel,
              order: level.order,
              departmentId: department.id,
              status: 'ACTIVE',
            },
          });
          createdLevels.push(createdLevel);
          this.logger.log(`Academic level created: ${createdLevel.name}`);
        }

        const orgSlug = `${department.code.toLowerCase()}-${level.name.toLowerCase().replace(/\s/g, '-')}-${session.name.replace('/', '-')}`;

        const existingOrg = await this.prisma.organization.findFirst({
          where: {
            slug: orgSlug,
            institutionId: faculty.institutionId,
            academicSessionId: session.id,
          },
        });

        if (!existingOrg) {
          const org = await this.prisma.organization.create({
            data: {
              name: `${department.name} - ${level.name} (${session.name})`,
              slug: orgSlug,
              description: `${level.name} organization for ${department.name} (${session.name})`,
              type: 'LEVEL',
              scope: 'LEVEL',
              institutionId: faculty.institutionId,
              facultyId: dto.facultyId,
              departmentId: department.id,
              academicLevelId: createdLevel.id,
              academicSessionId: session.id,
              createdBy: userId,
              status: 'ACTIVE',
            },
          });
          createdOrganizations.push(org);
          this.logger.log(
            `Organization created for ${level.name} (${session.name}): ${org.id}`,
          );

          try {
            await this.walletService.getOrCreateWallet({
              type: 'ORGANIZATION',
              id: org.id,
            });
            this.logger.log(`Wallet created for organization: ${org.id}`);
          } catch (walletError) {
            this.logger.warn(
              `Failed to create wallet for organization ${org.id}: ${walletError.message}`,
            );
          }
        }
      }

      const deptOrgSlug = `${department.code.toLowerCase()}-department-${session.name.replace('/', '-')}`;
      const existingDeptOrg = await this.prisma.organization.findFirst({
        where: {
          slug: deptOrgSlug,
          institutionId: faculty.institutionId,
          academicSessionId: session.id,
        },
      });

      if (!existingDeptOrg) {
        const deptOrg = await this.prisma.organization.create({
          data: {
            name: `${department.name} Department (${session.name})`,
            slug: deptOrgSlug,
            description: `Department organization for ${department.name} (${session.name})`,
            type: 'DEPARTMENT',
            scope: 'DEPARTMENT',
            institutionId: faculty.institutionId,
            facultyId: dto.facultyId,
            departmentId: department.id,
            academicSessionId: session.id,
            createdBy: userId,
            status: 'ACTIVE',
          },
        });
        createdOrganizations.push(deptOrg);
        this.logger.log(
          `Department organization created for ${session.name}: ${deptOrg.id}`,
        );

        try {
          await this.walletService.getOrCreateWallet({
            type: 'ORGANIZATION',
            id: deptOrg.id,
          });
          this.logger.log(
            `Wallet created for department organization: ${deptOrg.id}`,
          );
        } catch (walletError) {
          this.logger.warn(
            `Failed to create wallet for department organization ${deptOrg.id}: ${walletError.message}`,
          );
        }
      }
    }

    await this.invalidateInstitutionsCache(faculty.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DEPARTMENT_CREATED',
        details: JSON.stringify({
          departmentId: department.id,
          name: department.name,
          code: department.code,
          facultyId: dto.facultyId,
          numberOfLevels: levels.length,
          sessionsCount: sessions.length,
          levelsCreated: createdLevels.length,
          organizationsCreated: createdOrganizations.length,
          defaultSession: defaultSession.name,
        }),
      },
    });

    this.logger.log(
      `Department created: ${department.id} with ${createdLevels.length} levels and ${createdOrganizations.length} organizations across ${sessions.length} session(s)`,
    );

    return this.prisma.department.findUnique({
      where: { id: department.id },
      include: {
        academicLevels: {
          orderBy: { order: 'asc' },
        },
        faculty: {
          include: {
            institution: true,
          },
        },
      },
    });
  }

  async getDepartmentsByFaculty(facultyId: string) {
    const cacheKey = `departments:faculty:${facultyId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const faculty = await this.prisma.faculty.findUnique({
      where: { id: facultyId },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    const departments = await this.prisma.department.findMany({
      where: { facultyId },
      include: {
        academicLevels: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      departments,
      ['institutions', 'departments'],
      600,
    );

    return departments;
  }

  async getDepartmentById(id: string) {
    const cacheKey = `department:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        faculty: {
          include: {
            institution: true,
          },
        },
        academicLevels: {
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      department,
      ['institutions', 'departments'],
      600,
    );

    return department;
  }

  async updateDepartment(id: string, userId: string, dto: UpdateDepartmentDto) {
    this.logger.log(`Updating department: ${id}`);

    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        faculty: true,
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        promotionType: dto.promotionType as any,
        status: dto.status as any,
      },
    });

    await this.invalidateInstitutionsCache(department.faculty.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DEPARTMENT_UPDATED',
        details: JSON.stringify({
          departmentId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Department updated: ${id}`);
    return updated;
  }

  async deleteDepartment(id: string, userId: string) {
    this.logger.log(`Deleting department: ${id}`);

    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        academicLevels: true,
        faculty: true,
        organizations: true,
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (
      department.academicLevels.length > 0 ||
      department.organizations.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete department with existing academic levels or organizations. Archive instead.',
      );
    }

    const deleted = await this.prisma.department.delete({
      where: { id },
    });

    await this.invalidateInstitutionsCache(department.faculty.institutionId);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DEPARTMENT_DELETED',
        details: JSON.stringify({
          departmentId: id,
          name: department.name,
          facultyId: department.facultyId,
        }),
      },
    });

    this.logger.log(`Department deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // ACADEMIC LEVEL CRUD
  // ============================================

  async createAcademicLevel(userId: string, dto: CreateAcademicLevelDto) {
    this.logger.log(`Creating academic level: ${dto.name}`);

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
      include: {
        faculty: {
          include: {
            institution: true,
          },
        },
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const existing = await this.prisma.academicLevel.findFirst({
      where: {
        departmentId: dto.departmentId,
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Academic level already exists in this department',
      );
    }

    const level = await this.prisma.academicLevel.create({
      data: {
        name: dto.name,
        numericLevel: dto.numericLevel,
        order: dto.order,
        departmentId: dto.departmentId,
        status: 'ACTIVE',
      },
    });

    const orgSlug = `${department.code.toLowerCase()}-${level.name.toLowerCase().replace(/\s/g, '-')}`;
    const existingOrg = await this.prisma.organization.findFirst({
      where: {
        slug: orgSlug,
        institutionId: department.faculty.institutionId,
      },
    });

    if (!existingOrg) {
      const org = await this.prisma.organization.create({
        data: {
          name: `${department.name} - ${level.name}`,
          slug: orgSlug,
          description: `${level.name} organization for ${department.name}`,
          type: 'LEVEL',
          scope: 'LEVEL',
          institutionId: department.faculty.institutionId,
          facultyId: department.facultyId,
          departmentId: department.id,
          academicLevelId: level.id,
          createdBy: userId,
          status: 'ACTIVE',
        },
      });

      try {
        await this.walletService.getOrCreateWallet({
          type: 'ORGANIZATION',
          id: org.id,
        });
      } catch (walletError) {
        this.logger.warn(
          `Failed to create wallet for organization ${org.id}: ${walletError.message}`,
        );
      }

      this.logger.log(`Organization created for academic level: ${level.name}`);
    }

    await this.invalidateInstitutionsCache();

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_LEVEL_CREATED',
        details: JSON.stringify({
          levelId: level.id,
          name: level.name,
          numericLevel: level.numericLevel,
          departmentId: dto.departmentId,
        }),
      },
    });

    this.logger.log(`Academic level created: ${level.id}`);
    return level;
  }

  async getAcademicLevelsByDepartment(departmentId: string) {
    const cacheKey = `academic-levels:department:${departmentId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const levels = await this.prisma.academicLevel.findMany({
      where: { departmentId },
      orderBy: { order: 'asc' },
    });

    await this.cacheService.setWithTag(
      cacheKey,
      levels,
      ['institutions', 'academic-levels'],
      600,
    );

    return levels;
  }

  async getAcademicLevelById(id: string) {
    const cacheKey = `academic-level:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const level = await this.prisma.academicLevel.findUnique({
      where: { id },
      include: {
        department: {
          include: {
            faculty: {
              include: {
                institution: true,
              },
            },
          },
        },
      },
    });
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    await this.cacheService.setWithTag(
      cacheKey,
      level,
      ['institutions', 'academic-levels'],
      600,
    );

    return level;
  }

  async deleteAcademicLevel(id: string, userId: string) {
    this.logger.log(`Deleting academic level: ${id}`);

    const level = await this.prisma.academicLevel.findUnique({
      where: { id },
      include: {
        students: true,
        academicRecords: true,
        organizations: true,
      },
    });
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    if (
      level.students.length > 0 ||
      level.academicRecords.length > 0 ||
      level.organizations.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete academic level with associated students, records, or organizations. Archive instead.',
      );
    }

    const deleted = await this.prisma.academicLevel.delete({
      where: { id },
    });

    await this.invalidateInstitutionsCache();

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_LEVEL_DELETED',
        details: JSON.stringify({
          levelId: id,
          name: level.name,
          departmentId: level.departmentId,
        }),
      },
    });

    this.logger.log(`Academic level deleted: ${id}`);
    return deleted;
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  async bulkCreateAcademicLevels(
    userId: string,
    departmentId: string,
    levels: CreateAcademicLevelDto[],
  ) {
    this.logger.log(
      `Bulk creating academic levels for department: ${departmentId}`,
    );

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        faculty: {
          include: {
            institution: true,
          },
        },
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const createdLevels: any[] = [];
    for (const level of levels) {
      const existing = await this.prisma.academicLevel.findFirst({
        where: {
          departmentId,
          name: level.name,
        },
      });
      if (!existing) {
        const created = await this.prisma.academicLevel.create({
          data: {
            name: level.name,
            numericLevel: level.numericLevel,
            order: level.order,
            departmentId,
            status: 'ACTIVE',
          },
        });
        createdLevels.push(created);

        const orgSlug = `${department.code.toLowerCase()}-${level.name.toLowerCase().replace(/\s/g, '-')}`;
        const existingOrg = await this.prisma.organization.findFirst({
          where: {
            slug: orgSlug,
            institutionId: department.faculty.institutionId,
          },
        });

        if (!existingOrg) {
          const org = await this.prisma.organization.create({
            data: {
              name: `${department.name} - ${level.name}`,
              slug: orgSlug,
              description: `${level.name} organization for ${department.name}`,
              type: 'LEVEL',
              scope: 'LEVEL',
              institutionId: department.faculty.institutionId,
              facultyId: department.facultyId,
              departmentId: department.id,
              academicLevelId: created.id,
              createdBy: userId,
              status: 'ACTIVE',
            },
          });

          try {
            await this.walletService.getOrCreateWallet({
              type: 'ORGANIZATION',
              id: org.id,
            });
          } catch (walletError) {
            this.logger.warn(
              `Failed to create wallet for organization ${org.id}: ${walletError.message}`,
            );
          }

          this.logger.log(
            `Organization created for academic level: ${level.name}`,
          );
        }
      }
    }

    await this.invalidateInstitutionsCache();

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_LEVELS_BULK_CREATED',
        details: JSON.stringify({
          departmentId,
          count: createdLevels.length,
        }),
      },
    });

    this.logger.log(`Bulk created ${createdLevels.length} academic levels`);
    return createdLevels;
  }

  async generateOrganizationsForDepartment(
    departmentId: string,
    userId: string,
  ) {
    this.logger.log(`Generating organizations for department: ${departmentId}`);

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        academicLevels: true,
        faculty: {
          include: {
            institution: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: {
        institutionId: department.faculty.institutionId,
        status: { in: ['ACTIVE', 'UPCOMING'] },
      },
    });

    if (sessions.length === 0) {
      const defaultSession = await this.getOrCreateDefaultSession(
        department.faculty.institutionId,
        userId,
      );
      sessions.push(defaultSession);
    }

    const createdOrgs: any[] = [];

    for (const session of sessions) {
      for (const level of department.academicLevels) {
        const slug = `${department.code.toLowerCase()}-${level.name.toLowerCase().replace(/\s/g, '-')}-${session.name.replace('/', '-')}`;

        const existingOrg = await this.prisma.organization.findFirst({
          where: {
            slug,
            institutionId: department.faculty.institutionId,
            academicSessionId: session.id,
          },
        });

        if (!existingOrg) {
          const org = await this.prisma.organization.create({
            data: {
              name: `${department.name} - ${level.name} (${session.name})`,
              slug,
              description: `${level.name} organization for ${department.name} (${session.name})`,
              type: 'LEVEL',
              scope: 'LEVEL',
              institutionId: department.faculty.institutionId,
              facultyId: department.facultyId,
              departmentId: department.id,
              academicLevelId: level.id,
              academicSessionId: session.id,
              createdBy: userId,
              status: 'ACTIVE',
            },
          });
          createdOrgs.push(org);

          try {
            await this.walletService.getOrCreateWallet({
              type: 'ORGANIZATION',
              id: org.id,
            });
          } catch (walletError) {
            this.logger.warn(
              `Failed to create wallet for organization ${org.id}: ${walletError.message}`,
            );
          }

          this.logger.log(
            `Created organization for ${level.name} (${session.name}): ${org.id}`,
          );
        }
      }

      const deptSlug = `${department.code.toLowerCase()}-department-${session.name.replace('/', '-')}`;
      const existingDeptOrg = await this.prisma.organization.findFirst({
        where: {
          slug: deptSlug,
          institutionId: department.faculty.institutionId,
          academicSessionId: session.id,
        },
      });

      if (!existingDeptOrg) {
        const deptOrg = await this.prisma.organization.create({
          data: {
            name: `${department.name} Department (${session.name})`,
            slug: deptSlug,
            description: `Department organization for ${department.name} (${session.name})`,
            type: 'DEPARTMENT',
            scope: 'DEPARTMENT',
            institutionId: department.faculty.institutionId,
            facultyId: department.facultyId,
            departmentId: department.id,
            academicSessionId: session.id,
            createdBy: userId,
            status: 'ACTIVE',
          },
        });
        createdOrgs.push(deptOrg);

        try {
          await this.walletService.getOrCreateWallet({
            type: 'ORGANIZATION',
            id: deptOrg.id,
          });
        } catch (walletError) {
          this.logger.warn(
            `Failed to create wallet for department organization ${deptOrg.id}: ${walletError.message}`,
          );
        }

        this.logger.log(
          `Created department organization for ${session.name}: ${deptOrg.id}`,
        );
      }
    }

    await this.invalidateInstitutionsCache(department.faculty.institutionId);

    return {
      department,
      organizationsCreated: createdOrgs,
    };
  }
}
