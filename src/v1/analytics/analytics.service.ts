// src/v1/analytics/analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // DASHBOARD ANALYTICS
  // ============================================

  async getDashboardAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:dashboard:${dto.institutionId || 'all'}:${dto.organizationId || 'all'}:${dto.startDate || 'all'}:${dto.endDate || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [revenue, students, organizations, recentActivities] =
      await Promise.all([
        this.getRevenueAnalytics(dto),
        this.getStudentAnalytics(dto),
        this.getOrganizationAnalytics(dto),
        this.getRecentActivities(dto),
      ]);

    const dashboard = {
      summary: {
        totalUsers: await this.prisma.user.count(),
        totalStudents: students.totalStudents,
        totalOrganizations: organizations.totalOrganizations,
        totalRevenue: revenue.totalRevenue,
        totalRevenueFormatted: revenue.totalRevenueFormatted,
        totalTransactions: revenue.totalTransactions,
      },
      revenue,
      students,
      organizations,
      recentActivities,
      updatedAt: new Date(),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      dashboard,
      ['analytics', 'dashboard'],
      300,
    );
    return dashboard;
  }

  // ============================================
  // REVENUE ANALYTICS
  // ============================================

  async getRevenueAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:revenue:${dto.institutionId || 'all'}:${dto.organizationId || 'all'}:${dto.startDate || 'all'}:${dto.endDate || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { startDate, endDate, period = AnalyticsPeriod.MONTHLY } = dto;
    const where: any = { status: 'COMPLETED' };

    if (dto.institutionId) {
      where.organization = { institutionId: dto.institutionId };
    }
    if (dto.organizationId) {
      where.organizationId = dto.organizationId;
    }
    if (startDate) {
      where.paidAt = { ...where.paidAt, gte: new Date(startDate) };
    }
    if (endDate) {
      where.paidAt = { ...where.paidAt, lte: new Date(endDate) };
    }

    // Total revenue and transactions
    const [totalAgg, paymentMethods, topOrgs] = await Promise.all([
        this.prisma.payment.aggregate({
          where,
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.payment.groupBy({
          by: ['paymentMethod'],
          where,
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.payment.groupBy({
          by: ['organizationId'],
          where,
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 10,
        }),
      ]);

    // A payment belongs to an organization, while the institution is a field
    // on that organization. Prisma cannot group a model by a related field, so
    // aggregate the payment totals at the institution level in SQL.
    const institutionConditions = [
      Prisma.sql`p."status" = CAST(${'COMPLETED'} AS "PaymentStatus")`,
    ];
    if (dto.institutionId) {
      institutionConditions.push(
        Prisma.sql`o."institutionId" = ${dto.institutionId}`,
      );
    }
    if (dto.organizationId) {
      institutionConditions.push(
        Prisma.sql`p."organizationId" = ${dto.organizationId}`,
      );
    }
    if (startDate) {
      institutionConditions.push(
        Prisma.sql`p."paidAt" >= ${new Date(startDate)}`,
      );
    }
    if (endDate) {
      institutionConditions.push(
        Prisma.sql`p."paidAt" <= ${new Date(endDate)}`,
      );
    }

    const topInstitutions = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; revenue: bigint }>
    >(Prisma.sql`
      SELECT
        i."id" AS "id",
        i."name" AS "name",
        SUM(p."amount")::bigint AS "revenue"
      FROM "payments" p
      INNER JOIN "organizations" o ON o."id" = p."organizationId"
      INNER JOIN "institutions" i ON i."id" = o."institutionId"
      WHERE ${Prisma.join(institutionConditions, ' AND ')}
      GROUP BY i."id", i."name"
      ORDER BY SUM(p."amount") DESC
      LIMIT 10
    `);

    // Revenue trend - using raw query
    const revenueTrend = await this.getRevenueTrend(where, period);

    // Get organization names for top performers
    const orgIds = topOrgs.map((o) => o.organizationId);
    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const orgMap = new Map(organizations.map((o) => [o.id, o.name]));

    const totalRevenue = totalAgg._sum.amount || 0;
    const totalTransactions = totalAgg._count.id || 0;

    const analytics = {
      totalRevenue,
      totalRevenueFormatted: `₦${(totalRevenue / 100).toFixed(2)}`,
      totalTransactions,
      averageTransactionValue:
        totalTransactions > 0
          ? Math.round(totalRevenue / totalTransactions)
          : 0,
      averageTransactionValueFormatted:
        totalTransactions > 0
          ? `₦${(totalRevenue / totalTransactions / 100).toFixed(2)}`
          : '₦0.00',
      revenueGrowth: await this.calculateRevenueGrowth(where),
      revenueTrend: Array.isArray(revenueTrend)
        ? revenueTrend.map((item: any) => {
            const amount = Number(item.total || 0);
            return {
              period: item.period,
              amount,
              amountFormatted: `₦${(amount / 100).toFixed(2)}`,
            };
          })
        : [],
      revenueByPaymentMethod: paymentMethods.map((pm) => ({
        method: pm.paymentMethod,
        amount: pm._sum.amount || 0,
        amountFormatted: `₦${((pm._sum.amount || 0) / 100).toFixed(2)}`,
        percentage:
          totalRevenue > 0
            ? Math.round(((pm._sum.amount || 0) / totalRevenue) * 100)
            : 0,
      })),
      topPerforming: {
        organizations: topOrgs.map((o) => ({
          id: o.organizationId,
          name: orgMap.get(o.organizationId) || 'Unknown',
          revenue: o._sum.amount || 0,
          revenueFormatted: `₦${((o._sum.amount || 0) / 100).toFixed(2)}`,
        })),
        institutions: topInstitutions.map((institution) => ({
          id: institution.id,
          name: institution.name,
          revenue: Number(institution.revenue),
          revenueFormatted: `₦${(Number(institution.revenue) / 100).toFixed(2)}`,
        })),
      },
    };

    await this.cacheService.setWithTag(
      cacheKey,
      analytics,
      ['analytics', 'revenue'],
      1800,
    );
    return analytics;
  }

  // ============================================
  // STUDENT ANALYTICS
  // ============================================

  async getStudentAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:students:${dto.institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (dto.institutionId) {
      where.institutionId = dto.institutionId;
    }

    const [total, byStatus, byLevel, byDepartment, newStudents] =
      await Promise.all([
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
        this.prisma.studentProfile.count({
          where: {
            ...where,
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ]);

    // Get names
    const levelIds = byLevel
      .map((item) => item.currentAcademicLevelId)
      .filter(Boolean);
    const levels = await this.prisma.academicLevel.findMany({
      where: { id: { in: levelIds as string[] } },
      select: { id: true, name: true },
    });
    const levelMap = new Map(levels.map((l) => [l.id, l.name]));

    const deptIds = byDepartment
      .map((item) => item.departmentId)
      .filter(Boolean);
    const departments = await this.prisma.department.findMany({
      where: { id: { in: deptIds as string[] } },
      select: { id: true, name: true },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    const activeStudents =
      byStatus.find((s) => s.academicStatus === 'ACTIVE')?._count.id || 0;
    const graduatedStudents =
      byStatus.find((s) => s.academicStatus === 'GRADUATED')?._count.id || 0;

    const analytics = {
      totalStudents: total,
      newStudents,
      activeStudents,
      graduationRate:
        total > 0 ? Math.round((graduatedStudents / total) * 100) : 0,
      enrollmentTrend: await this.getEnrollmentTrend(where),
      studentsByLevel: byLevel.map((item) => ({
        level: levelMap.get(item.currentAcademicLevelId as string) || 'Unknown',
        count: item._count.id,
      })),
      studentsByDepartment: byDepartment.map((item) => ({
        department: deptMap.get(item.departmentId as string) || 'Unknown',
        count: item._count.id,
      })),
      studentsByStatus: byStatus.map((item) => ({
        status: item.academicStatus,
        count: item._count.id,
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      analytics,
      ['analytics', 'students'],
      3600,
    );
    return analytics;
  }

  // ============================================
  // ORGANIZATION ANALYTICS
  // ============================================

  async getOrganizationAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:organizations:${dto.institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (dto.institutionId) {
      where.institutionId = dto.institutionId;
    }

    const [total, byType, byStatus, activeThisMonth] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prisma.organization.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.organization.count({
        where: {
          ...where,
          activatedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    const [totalMembers, activeMembers] = await Promise.all([
      this.prisma.organizationMembership.count({
        where: { organization: where },
      }),
      this.prisma.organizationMembership.count({
        where: { organization: where, status: 'ACTIVE' },
      }),
    ]);

    const analytics = {
      totalOrganizations: total,
      activeOrganizations:
        byStatus.find((s) => s.status === 'ACTIVE')?._count.id || 0,
      pendingActivation:
        byStatus.find((s) => s.status === 'PENDING_ACTIVATION')?._count.id || 0,
      organizationGrowth: await this.getOrganizationGrowth(where),
      organizationsByType: byType.map((item) => ({
        type: item.type,
        count: item._count.id,
      })),
      organizationsByStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.id,
      })),
      memberStats: {
        totalMembers,
        averageMembersPerOrganization:
          total > 0 ? Math.round(totalMembers / total) : 0,
      },
    };

    await this.cacheService.setWithTag(
      cacheKey,
      analytics,
      ['analytics', 'organizations'],
      3600,
    );
    return analytics;
  }

  // ============================================
  // COLLECTION ANALYTICS
  // ============================================

  async getCollectionAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:collections:${dto.institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (dto.institutionId) {
      where.organization = { institutionId: dto.institutionId };
    }

    const [totalDueAmount, collectedAmount, dueCount, paidCount, overdueCount] =
      await Promise.all([
        this.prisma.due.aggregate({
          where: { ...where, status: 'ACTIVE' },
          _sum: { amount: true },
        }),
        this.prisma.duePayment.aggregate({
          where: {
            assignment: {
              due: {
                ...where,
                status: 'ACTIVE',
              },
            },
          },
          _sum: { amount: true },
        }),
        this.prisma.due.count({
          where: { ...where, status: 'ACTIVE' },
        }),
        this.prisma.dueAssignment.count({
          where: {
            due: { ...where, status: 'ACTIVE' },
            isPaid: true,
          },
        }),
        this.prisma.dueAssignment.count({
          where: {
            due: {
              ...where,
              status: 'ACTIVE',
              dueDate: { lt: new Date() },
            },
            isPaid: false,
          },
        }),
      ]);

    const totalDueAmountValue = totalDueAmount._sum.amount || 0;
    const collectedAmountValue = collectedAmount._sum.amount || 0;

    const analytics = {
      totalDueAmount: totalDueAmountValue,
      collectedAmount: collectedAmountValue,
      collectionRate:
        totalDueAmountValue > 0
          ? Math.round((collectedAmountValue / totalDueAmountValue) * 100)
          : 0,
      dueCount,
      paidCount,
      overdueCount,
    };

    await this.cacheService.setWithTag(
      cacheKey,
      analytics,
      ['analytics', 'collections'],
      1800,
    );
    return analytics;
  }

  // ============================================
  // GROWTH ANALYTICS
  // ============================================

  async getGrowthAnalytics(dto: AnalyticsQueryDto) {
    const cacheKey = `analytics:growth:${dto.institutionId || 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (dto.institutionId) {
      where.institutionId = dto.institutionId;
    }

    // Student growth over last 6 months
    const studentGrowth: Array<{ month: string; year: number; total: number }> =
      [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await this.prisma.studentProfile.count({
        where: {
          ...where,
          createdAt: { lte: monthEnd },
        },
      });
      studentGrowth.push({
        month: date.toLocaleString('default', { month: 'short' }),
        year: date.getFullYear(),
        total: count,
      });
    }

    // Organization growth over last 6 months
    const orgGrowth: Array<{ month: string; year: number; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await this.prisma.organization.count({
        where: {
          ...where,
          createdAt: { lte: monthEnd },
        },
      });
      orgGrowth.push({
        month: date.toLocaleString('default', { month: 'short' }),
        year: date.getFullYear(),
        total: count,
      });
    }

    // Revenue growth over last 6 months
    const revenueGrowth: Array<{ month: string; year: number; total: number }> =
      [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const revenue = await this.prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          paidAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(dto.institutionId
            ? { organization: { institutionId: dto.institutionId } }
            : {}),
        },
        _sum: { amount: true },
      });

      revenueGrowth.push({
        month: startDate.toLocaleString('default', { month: 'short' }),
        year: startDate.getFullYear(),
        total: revenue._sum.amount || 0,
      });
    }

    const analytics = {
      studentGrowth,
      organizationGrowth: orgGrowth,
      revenueGrowth: revenueGrowth.map((r) => ({
        ...r,
        totalFormatted: `₦${(r.total / 100).toFixed(2)}`,
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      analytics,
      ['analytics', 'growth'],
      7200,
    );
    return analytics;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getRevenueTrend(where: any, period: AnalyticsPeriod) {
    const conditions = [
      Prisma.sql`"status" = CAST(${'COMPLETED'} AS "PaymentStatus")`,
    ];

    if (where.organizationId) {
      conditions.push(
        Prisma.sql`"organizationId" = ${where.organizationId}`,
      );
    }
    if (where.paidAt?.gte) {
      conditions.push(Prisma.sql`"paidAt" >= ${where.paidAt.gte}`);
    }
    if (where.paidAt?.lte) {
      conditions.push(Prisma.sql`"paidAt" <= ${where.paidAt.lte}`);
    }

    return this.prisma.$queryRaw<
      Array<{ period: Date; total: bigint }>
    >(Prisma.sql`
      SELECT
        DATE_TRUNC('month', "paidAt") AS "period",
        SUM("amount")::bigint AS "total"
      FROM "payments"
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY DATE_TRUNC('month', "paidAt")
      ORDER BY "period" ASC
      LIMIT 12
    `);
  }

  private async calculateRevenueGrowth(where: any): Promise<number> {
    const currentPeriod = await this.prisma.payment.aggregate({
      where: {
        ...where,
        paidAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
          lte: new Date(),
        },
      },
      _sum: { amount: true },
    });

    const previousPeriod = await this.prisma.payment.aggregate({
      where: {
        ...where,
        paidAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 0),
        },
      },
      _sum: { amount: true },
    });

    const current = currentPeriod._sum.amount || 0;
    const previous = previousPeriod._sum.amount || 0;

    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private async getEnrollmentTrend(where: any) {
    const results: Array<{ period: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const count = await this.prisma.studentProfile.count({
        where: {
          ...where,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      results.push({
        period: startDate.toLocaleString('default', { month: 'short' }),
        count,
      });
    }
    return results;
  }

  private async getOrganizationGrowth(where: any) {
    const results: Array<{ period: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const count = await this.prisma.organization.count({
        where: {
          ...where,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      results.push({
        period: startDate.toLocaleString('default', { month: 'short' }),
        count,
      });
    }
    return results;
  }

  private async getRecentActivities(dto: AnalyticsQueryDto) {
    const activities = await this.prisma.activityLog.findMany({
      where: {
        ...(dto.institutionId ? { institutionId: dto.institutionId } : {}),
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    return activities.map((activity) => ({
      id: activity.id,
      type: (activity as any).action || (activity as any).activity || 'Unknown',
      description:
        typeof activity.details === 'string'
          ? activity.details
          : JSON.stringify(activity.details || 'No details'),
      userId: activity.userId || 'system',
      userName: activity.user?.username || 'System',
      createdAt: activity.createdAt,
    }));
  }

  // ============================================
  // CACHE INVALIDATION
  // ============================================

  async invalidateAnalyticsCache() {
    try {
      await this.cacheService.invalidateByTag('analytics');
      await this.cacheService.invalidateByTag('revenue');
      await this.cacheService.invalidateByTag('students');
      await this.cacheService.invalidateByTag('organizations');
      await this.cacheService.invalidateByTag('collections');
      await this.cacheService.invalidateByTag('growth');
      await this.cacheService.invalidateByTag('dashboard');
      await this.cacheService.invalidatePattern('analytics:*');

      this.logger.log('Analytics cache invalidated');
    } catch (error) {
      this.logger.error(
        `Failed to invalidate analytics cache: ${error.message}`,
      );
    }
  }
}
