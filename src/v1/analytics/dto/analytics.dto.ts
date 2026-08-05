// src/v1/analytics/dto/analytics.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum AnalyticsPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    enum: AnalyticsPeriod,
    default: AnalyticsPeriod.MONTHLY,
  })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod = AnalyticsPeriod.MONTHLY;
}

export class RevenueAnalyticsDto {
  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  totalRevenueFormatted: string;

  @ApiProperty()
  totalTransactions: number;

  @ApiProperty()
  averageTransactionValue: number;

  @ApiProperty()
  averageTransactionValueFormatted: string;

  @ApiProperty()
  revenueGrowth: number;

  @ApiProperty({ type: 'array' })
  revenueTrend: Array<{
    period: string;
    amount: number;
    amountFormatted: string;
  }>;

  @ApiProperty({ type: 'array' })
  revenueByPaymentMethod: Array<{
    method: string;
    amount: number;
    amountFormatted: string;
    percentage: number;
  }>;

  @ApiProperty()
  topPerforming: {
    organizations: Array<{
      id: string;
      name: string;
      revenue: number;
      revenueFormatted: string;
    }>;
    institutions: Array<{
      id: string;
      name: string;
      revenue: number;
      revenueFormatted: string;
    }>;
  };
}

export class StudentAnalyticsDto {
  @ApiProperty()
  totalStudents: number;

  @ApiProperty()
  newStudents: number;

  @ApiProperty()
  activeStudents: number;

  @ApiProperty()
  graduationRate: number;

  @ApiProperty({ type: 'array' })
  enrollmentTrend: Array<{
    period: string;
    count: number;
  }>;

  @ApiProperty({ type: 'array' })
  studentsByLevel: Array<{
    level: string;
    count: number;
  }>;

  @ApiProperty({ type: 'array' })
  studentsByDepartment: Array<{
    department: string;
    count: number;
  }>;

  @ApiProperty({ type: 'array' })
  studentsByStatus: Array<{
    status: string;
    count: number;
  }>;
}

export class OrganizationAnalyticsDto {
  @ApiProperty()
  totalOrganizations: number;

  @ApiProperty()
  activeOrganizations: number;

  @ApiProperty()
  pendingActivation: number;

  @ApiProperty({ type: 'array' })
  organizationGrowth: Array<{
    period: string;
    count: number;
  }>;

  @ApiProperty({ type: 'array' })
  organizationsByType: Array<{
    type: string;
    count: number;
  }>;

  @ApiProperty({ type: 'array' })
  organizationsByStatus: Array<{
    status: string;
    count: number;
  }>;

  @ApiProperty()
  memberStats: {
    totalMembers: number;
    averageMembersPerOrganization: number;
  };
}

export class DashboardAnalyticsDto {
  @ApiProperty()
  summary: {
    totalUsers: number;
    totalStudents: number;
    totalOrganizations: number;
    totalRevenue: number;
    totalRevenueFormatted: string;
    totalTransactions: number;
  };

  @ApiProperty()
  revenue: RevenueAnalyticsDto;

  @ApiProperty()
  students: StudentAnalyticsDto;

  @ApiProperty()
  organizations: OrganizationAnalyticsDto;

  @ApiProperty({ type: 'array' })
  recentActivities: Array<{
    id: string;
    type: string;
    description: string;
    userId: string;
    userName: string;
    createdAt: Date;
  }>;

  @ApiProperty()
  updatedAt: Date;
}
