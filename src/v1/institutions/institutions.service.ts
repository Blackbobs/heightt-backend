import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import {
  CreateInstitutionDto,
  UpdateInstitutionDto,
  CreateFacultyDto,
  UpdateFacultyDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateAcademicLevelDto,
  CreateAcademicSessionDto,
} from './dto';

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // INSTITUTION CRUD
  // ============================================

  async createInstitution(userId: string, dto: CreateInstitutionDto) {
    this.logger.log(`Creating institution: ${dto.name}`);

    // Check if code already exists
    const existingCode = await this.prisma.institution.findUnique({
      where: { code: dto.code },
    });
    if (existingCode) {
      throw new ConflictException('Institution code already exists');
    }

    const institution = await this.prisma.institution.create({
      data: {
        name: dto.name,
        shortName: dto.shortName,
        code: dto.code,
        logo: dto.logo,
        website: dto.website,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        createdBy: userId,
        status: 'ACTIVE',
      },
    });

    // Log activity
    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'INSTITUTION_CREATED',
        details: {
          institutionId: institution.id,
          name: institution.name,
          code: institution.code,
        },
      },
    });

    this.logger.log(`Institution created: ${institution.id}`);
    return institution;
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
    // Check cache
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

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, institution, 300);

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

    // If code is being updated, check uniqueness
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
      },
    });

    // Invalidate cache
    await this.cacheService.delete(`institution:${id}`);

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

    // Check if institution has related data
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

    await this.cacheService.delete(`institution:${id}`);

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

  // ============================================
  // FACULTY CRUD
  // ============================================

  async createFaculty(userId: string, dto: CreateFacultyDto) {
    this.logger.log(`Creating faculty: ${dto.name}`);

    // Verify institution exists
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    // Check if faculty code already exists in institution
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
        institutionId: dto.institutionId,
        createdBy: userId,
        status: 'ACTIVE',
      },
    });

    await this.cacheService.delete(`institution:${dto.institutionId}`);

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
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    return this.prisma.faculty.findMany({
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
  }

  async getFacultyById(id: string) {
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
      },
    });

    await this.cacheService.delete(`institution:${faculty.institutionId}`);

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

    await this.cacheService.delete(`institution:${faculty.institutionId}`);

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
  // DEPARTMENT CRUD
  // ============================================

  async createDepartment(userId: string, dto: CreateDepartmentDto) {
    this.logger.log(`Creating department: ${dto.name}`);

    // Verify faculty exists
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: dto.facultyId },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    // Check if department code already exists in faculty
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
        facultyId: dto.facultyId,
        promotionType: dto.promotionType || 'AUTOMATIC',
        createdBy: userId,
        status: 'ACTIVE',
      },
    });

    await this.cacheService.delete(`institution:${faculty.institutionId}`);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'DEPARTMENT_CREATED',
        details: JSON.stringify({
          departmentId: department.id,
          name: department.name,
          code: department.code,
          facultyId: dto.facultyId,
        }),
      },
    });

    this.logger.log(`Department created: ${department.id}`);
    return department;
  }

  async getDepartmentsByFaculty(facultyId: string) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: facultyId },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    return this.prisma.department.findMany({
      where: { facultyId },
      include: {
        academicLevels: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDepartmentById(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        faculty: {
          include: {
            institution: true,
          },
        },
        academicLevels: true,
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
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
      },
    });

    await this.cacheService.delete(
      `institution:${department.faculty.institutionId}`,
    );

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
      },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department.academicLevels.length > 0) {
      throw new BadRequestException(
        'Cannot delete department with existing academic levels. Archive instead.',
      );
    }

    const deleted = await this.prisma.department.delete({
      where: { id },
    });

    await this.cacheService.delete(
      `institution:${department.faculty.institutionId}`,
    );

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

    // Verify department exists
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Check if level already exists in department
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
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.academicLevel.findMany({
      where: { departmentId },
      orderBy: { order: 'asc' },
    });
  }

  async getAcademicLevelById(id: string) {
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
    return level;
  }

  async deleteAcademicLevel(id: string, userId: string) {
    this.logger.log(`Deleting academic level: ${id}`);

    const level = await this.prisma.academicLevel.findUnique({
      where: { id },
      include: {
        students: true,
        academicRecords: true,
      },
    });
    if (!level) {
      throw new NotFoundException('Academic level not found');
    }

    if (level.students.length > 0 || level.academicRecords.length > 0) {
      throw new BadRequestException(
        'Cannot delete academic level with associated students or records. Archive instead.',
      );
    }

    const deleted = await this.prisma.academicLevel.delete({
      where: { id },
    });

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
  // ACADEMIC SESSION CRUD
  // ============================================

  async createAcademicSession(userId: string, dto: CreateAcademicSessionDto) {
    this.logger.log(`Creating academic session: ${dto.name}`);

    // Verify institution exists
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    // Check if session already exists
    const existing = await this.prisma.academicSession.findFirst({
      where: {
        institutionId: dto.institutionId,
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Academic session already exists in this institution',
      );
    }

    // If this is the current session, unset others
    if (dto.isCurrent) {
      await this.prisma.academicSession.updateMany({
        where: {
          institutionId: dto.institutionId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
    }

    const session = await this.prisma.academicSession.create({
      data: {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status || 'UPCOMING',
        isCurrent: dto.isCurrent || false,
        institutionId: dto.institutionId,
        createdBy: userId,
      },
    });

    await this.cacheService.delete(`institution:${dto.institutionId}`);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ACADEMIC_SESSION_CREATED',
        details: JSON.stringify({
          sessionId: session.id,
          name: session.name,
          institutionId: dto.institutionId,
        }),
      },
    });

    this.logger.log(`Academic session created: ${session.id}`);
    return session;
  }

  async getSessionsByInstitution(institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    return this.prisma.academicSession.findMany({
      where: { institutionId },
      orderBy: { startDate: 'desc' },
    });
  }

  async getAcademicSessionById(id: string) {
    const session = await this.prisma.academicSession.findUnique({
      where: { id },
      include: {
        institution: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }
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
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    // If this is the current session, unset others
    if (dto.isCurrent) {
      await this.prisma.academicSession.updateMany({
        where: {
          institutionId: session.institutionId,
          isCurrent: true,
          NOT: { id },
        },
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
    });

    await this.cacheService.delete(`institution:${session.institutionId}`);

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
      },
    });
    if (!session) {
      throw new NotFoundException('Academic session not found');
    }

    if (
      session.dues.length > 0 ||
      session.studentRecords.length > 0 ||
      session.promotions.length > 0
    ) {
      throw new BadRequestException(
        'Cannot delete academic session with associated records. Archive instead.',
      );
    }

    const deleted = await this.prisma.academicSession.delete({
      where: { id },
    });

    await this.cacheService.delete(`institution:${session.institutionId}`);

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
}
