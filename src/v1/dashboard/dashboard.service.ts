// src/v1/dashboard/dashboard.service.ts
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ============================================
  // STUDENT DASHBOARD
  // ============================================

  async getStudentDashboard(userId: string) {
    const cacheKey = `dashboard:student:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get student profile
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
      throw new ForbiddenException('Student profile not found');
    }

    // Get organizations
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        organization: true,
      },
    });

    const organizationIds = memberships.map((m) => m.organizationId);

    // Get upcoming dues
    const upcomingDues = await this.prisma.dueAssignment.findMany({
      where: {
        studentId: student.id,
        isPaid: false,
        due: {
          dueDate: { gt: new Date() },
          status: 'ACTIVE',
          organizationId: { in: organizationIds },
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
      orderBy: { due: { dueDate: 'asc' } },
    });

    // Get recent announcements
    const announcements = await this.prisma.announcement.findMany({
      where: {
        isPublished: true,
        expiresAt: { gt: new Date() },
        organizationId: { in: organizationIds },
      },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: {
        organization: true,
      },
    });

    // Get upcoming events
    const events = await this.prisma.event.findMany({
      where: {
        startDate: { gt: new Date() },
        status: 'PUBLISHED',
        organizationId: { in: organizationIds },
      },
      take: 5,
      orderBy: { startDate: 'asc' },
      include: {
        organization: true,
      },
    });

    // Get wallet balance
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    // Get unread notifications count
    const unreadNotifications = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    const dashboard = {
      student: {
        id: student.id,
        name: student.user?.profile?.firstName
          ? `${student.user.profile.firstName} ${student.user.profile.lastName || ''}`
          : student.user?.username || 'Unknown',
        email: student.user?.email,
        username: student.user?.username,
        level: student.currentAcademicLevel?.name,
        department: student.department?.name,
        faculty: student.faculty?.name,
        institution: student.institution?.name,
        matricNumber: student.matricNumber,
      },
      wallet: {
        balance: wallet?.balance || 0,
        formattedBalance: `₦${((wallet?.balance || 0) / 100).toFixed(2)}`,
      },
      organizations: {
        total: memberships.length,
        list: memberships.slice(0, 5).map((m) => ({
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
          amount: Number(d.amount),
          formattedAmount: `₦${(Number(d.amount) / 100).toFixed(2)}`,
          dueDate: d.due.dueDate,
          organization: d.due.organization?.name || 'Unknown',
          isLate: d.due.dueDate < new Date(),
        })),
        totalUpcomingDues: upcomingDues.reduce(
          (sum, d) => sum + Number(d.amount),
          0,
        ),
        formattedTotalDues: `₦${(upcomingDues.reduce((sum, d) => sum + Number(d.amount), 0) / 100).toFixed(2)}`,
      },
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        publishedAt: a.publishedAt,
        organization: a.organization?.name || 'Unknown',
        priority: a.priority,
      })),
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        location: e.location,
        organization: e.organization?.name || 'Unknown',
      })),
      notifications: {
        unread: unreadNotifications,
      },
    };

    // Cache with tags for invalidation
    await this.cacheService.setWithTag(
      cacheKey,
      dashboard,
      ['dashboard', 'student', `user:${userId}`],
      300,
    );

    return dashboard;
  }

  // ============================================
  // ADMIN DASHBOARD
  // ============================================

  async getAdminDashboard(userId: string) {
    const cacheKey = `dashboard:admin:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const admins = await this.prisma.admin.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        assignedAt: 'asc',
      },
    });

    if (!admins.length) {
      throw new ForbiddenException('Admin access required');
    }

    const primaryAdmin = admins[0];
    const organizationIds = [
      ...new Set(
        admins
          .filter((admin) => admin.organizationId)
          .map((admin) => admin.organizationId)
          .filter(Boolean) as string[],
      ),
    ];
    const isPlatformAdmin = primaryAdmin.adminType === 'PLATFORM_ADMIN';
    const institutionId = primaryAdmin.institutionId;

    const where: any = {};
    if (organizationIds.length > 0) {
      where.organizationId = { in: organizationIds };
    } else if (institutionId) {
      where.institutionId = institutionId;
    }

    // Get statistics
    const [
      totalStudents,
      totalOrganizations,
      totalEvents,
      totalPayments,
      totalRevenue,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.studentProfile.count({ where }),
      this.prisma.organization.count({ where }),
      this.prisma.event.count({
        where: {
          ...where,
          status: 'PUBLISHED',
        },
      }),
      this.prisma.payment.count({
        where: {
          organization: where,
          status: 'COMPLETED',
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          organization: where,
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
      this.prisma.studentVerification.count({
        where: {
          student: where,
          status: 'PENDING',
        },
      }),
    ]);

    // Get recent activities
    const recentActivities = await this.prisma.activityLog.findMany({
      where: {
        OR: [{ userId: { in: await this.getUserIdsInScope(primaryAdmin) } }],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
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

    // Get recent registrations
    const recentRegistrations = await this.prisma.studentProfile.findMany({
      where,
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
    });

    const dashboard = {
      admin: {
        type: primaryAdmin.adminType,
        scopes: admins.map((admin) => ({
          adminType: admin.adminType,
          institutionId: admin.institutionId,
          facultyId: admin.facultyId,
          departmentId: admin.departmentId,
          organizationId: admin.organizationId,
        })),
        scope: {
          institutionId: primaryAdmin.institutionId,
          facultyId: primaryAdmin.facultyId,
          departmentId: primaryAdmin.departmentId,
          organizationId: primaryAdmin.organizationId,
        },
      },
      statistics: {
        totalStudents,
        totalOrganizations,
        totalEvents,
        totalPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        formattedRevenue: `₦${((totalRevenue._sum.amount || 0) / 100).toFixed(2)}`,
        pendingVerifications,
      },
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        action: (a as any).action || 'Unknown',
        user: (a as any).user?.username || 'System',
        createdAt: a.createdAt,
        metadata: (a as any).metadata,
      })),
      recentRegistrations: recentRegistrations.map((s) => ({
        id: s.id,
        name: s.user?.profile?.firstName
          ? `${s.user.profile.firstName} ${s.user.profile.lastName || ''}`
          : s.user?.username || 'Unknown',
        email: s.user?.email,
        department: s.department?.name,
        level: s.currentAcademicLevel?.name,
        createdAt: s.createdAt,
      })),
    };

    await this.cacheService.setWithTag(
      cacheKey,
      dashboard,
      ['dashboard', 'admin', `user:${userId}`],
      300,
    );

    return dashboard;
  }

  // ============================================
  // PLATFORM ADMIN DASHBOARD
  // ============================================

  async getPlatformAdminDashboard(userId: string) {
    const cacheKey = `dashboard:platform:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Verify platform admin
    const admin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!admin) {
      throw new ForbiddenException('Platform admin access required');
    }

    const [
      totalUsers,
      totalStudents,
      totalOrganizations,
      totalInstitutions,
      totalEvents,
      totalPayments,
      totalRevenue,
      activeOrganizations,
      pendingVerifications,
      totalTransactions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.studentProfile.count(),
      this.prisma.organization.count(),
      this.prisma.institution.count(),
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      this.prisma.studentVerification.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
    ]);

    // Get system health
    const maintenance = await this.prisma.maintenanceMode.findFirst();
    const featureFlags = await this.prisma.featureFlag.count();
    const activeKillSwitches = await this.prisma.killSwitch.count({
      where: { enabled: true },
    });

    const dashboard = {
      admin: {
        type: 'PLATFORM_ADMIN',
      },
      statistics: {
        totalUsers,
        totalStudents,
        totalOrganizations,
        totalInstitutions,
        totalEvents,
        totalPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        formattedRevenue: `₦${((totalRevenue._sum.amount || 0) / 100).toFixed(2)}`,
        activeOrganizations,
        pendingVerifications,
        totalTransactions,
      },
      systemHealth: {
        maintenanceMode: maintenance?.enabled || false,
        maintenanceMessage: maintenance?.message,
        featureFlags,
        activeKillSwitches,
        uptime: process.uptime(),
      },
    };

    await this.cacheService.setWithTag(
      cacheKey,
      dashboard,
      ['dashboard', 'platform', `user:${userId}`],
      300,
    );

    return dashboard;
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateDashboardCache(
    userId?: string,
    dashboardType?: string,
  ): Promise<void> {
    try {
      // Invalidate all dashboard tags
      await this.cacheService.invalidateByTag('dashboard');

      // Invalidate specific dashboard types
      if (dashboardType === 'student' || !dashboardType) {
        await this.cacheService.invalidateByTag('student');
      }
      if (dashboardType === 'admin' || !dashboardType) {
        await this.cacheService.invalidateByTag('admin');
      }
      if (dashboardType === 'platform' || !dashboardType) {
        await this.cacheService.invalidateByTag('platform');
      }

      // Invalidate specific user dashboard
      if (userId) {
        await this.cacheService.invalidateByTag(`user:${userId}`);
        await this.cacheService.delete(`dashboard:student:${userId}`);
        await this.cacheService.delete(`dashboard:admin:${userId}`);
        await this.cacheService.delete(`dashboard:platform:${userId}`);
        await this.cacheService.invalidatePattern(`dashboard:*:${userId}`);
      }

      // Invalidate all dashboard patterns if no specific target
      if (!userId && !dashboardType) {
        await this.cacheService.invalidatePattern('dashboard:*');
      }

      this.logger.log(
        `Dashboard cache invalidated${userId ? ` for user: ${userId}` : ''}${dashboardType ? ` for type: ${dashboardType}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate dashboard cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getUserIdsInScope(admin: any): Promise<string[]> {
    // Get all user IDs within admin's scope
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { studentProfile: { institutionId: admin.institutionId } },
          {
            organizationMemberships: {
              some: { organizationId: admin.organizationId },
            },
          },
        ],
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }
}
