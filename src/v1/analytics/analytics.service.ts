import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // private readonly cacheService: CacheService,
  ) {}

  async getRevenueAnalytics(
    institutionId?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {};
    if (institutionId) {
      where.organization = { institutionId };
    }
    if (startDate) {
      where.paidAt = { ...where.paidAt, gte: new Date(startDate) };
    }
    if (endDate) {
      where.paidAt = { ...where.paidAt, lte: new Date(endDate) };
    }

    const payments = await this.prisma.payment.aggregate({
      where: {
        ...where,
        status: 'COMPLETED',
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const monthlyRevenue = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', paid_at) as month,
        SUM(amount) as total,
        COUNT(*) as count
      FROM payments
      WHERE status = 'COMPLETED'
        ${institutionId ? `AND organization_id IN (SELECT id FROM organizations WHERE institution_id = ${institutionId})` : ''}
        ${startDate ? `AND paid_at >= ${new Date(startDate)}` : ''}
        ${endDate ? `AND paid_at <= ${new Date(endDate)}` : ''}
      GROUP BY DATE_TRUNC('month', paid_at)
      ORDER BY month DESC
      LIMIT 12
    `;

    return {
      totalRevenue: payments._sum.amount || 0,
      totalTransactions: payments._count.id || 0,
      monthlyRevenue,
    };
  }

  async getStudentAnalytics(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    const [total, byStatus, byLevel, byDepartment, newThisMonth] =
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

    // Get level names
    const levelIds = byLevel
      .map((item) => item.currentAcademicLevelId)
      .filter(Boolean);
    const levels = await this.prisma.academicLevel.findMany({
      where: { id: { in: levelIds as string[] } },
      select: { id: true, name: true },
    });
    const levelMap = new Map(levels.map((l) => [l.id, l.name]));

    // Get department names
    const deptIds = byDepartment
      .map((item) => item.departmentId)
      .filter(Boolean);
    const departments = await this.prisma.department.findMany({
      where: { id: { in: deptIds as string[] } },
      select: { id: true, name: true },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    return {
      total,
      newThisMonth,
      byStatus: byStatus.map((item) => ({
        status: item.academicStatus,
        count: item._count.id,
      })),
      byLevel: byLevel.map((item) => ({
        level: levelMap.get(item.currentAcademicLevelId as string) || 'Unknown',
        count: item._count.id,
      })),
      byDepartment: byDepartment.map((item) => ({
        department: deptMap.get(item.departmentId as string) || 'Unknown',
        count: item._count.id,
      })),
    };
  }

  async getOrganizationAnalytics(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
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

    return {
      total,
      activeThisMonth,
      byType: byType.map((item) => ({
        type: item.type,
        count: item._count.id,
      })),
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.id,
      })),
    };
  }

  // Fix the getCollectionAnalytics method
  // Fix the getCollectionAnalytics method
  async getCollectionAnalytics(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.organization = { institutionId };
    }

    // Get overdue count - fix the duplicate due property
    const overdueCount = await this.prisma.dueAssignment.count({
      where: {
        due: {
          ...where,
          status: 'ACTIVE',
          dueDate: { lt: new Date() },
        },
        isPaid: false,
      },
    });

    const [totalDueAmount, collectedAmount, dueCount, paidCount] =
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
      ]);

    const totalDueAmountValue = totalDueAmount._sum.amount || 0;
    const collectedAmountValue = collectedAmount._sum.amount || 0;

    return {
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
  }
  async getGrowthAnalytics(institutionId?: string) {
    const where: any = {};
    if (institutionId) {
      where.institutionId = institutionId;
    }

    // Student growth over last 6 months
    const studentGrowth: Array<{ month: string; year: number; total: number }> =
      [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const count = await this.prisma.studentProfile.count({
        where: {
          ...where,
          createdAt: { lte: monthEnd },
        },
      });

      studentGrowth.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        year: monthStart.getFullYear(),
        total: count,
      });
    }

    // Organization growth over last 6 months
    const orgGrowth: Array<{ month: string; year: number; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const count = await this.prisma.organization.count({
        where: {
          ...where,
          createdAt: { lte: monthEnd },
        },
      });

      orgGrowth.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        year: monthStart.getFullYear(),
        total: count,
      });
    }

    return {
      studentGrowth,
      organizationGrowth: orgGrowth,
    };
  }
}
