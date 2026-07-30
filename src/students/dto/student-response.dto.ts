import { ApiProperty } from '@nestjs/swagger';

export class StudentAcademicRecordResponseDto {
  @ApiProperty({ example: 'rec_123', description: 'Record ID' })
  id: string;

  @ApiProperty({ example: 'sess_123', description: 'Session ID' })
  sessionId: string;

  @ApiProperty({ example: '2024/2025', description: 'Session name' })
  sessionName: string;

  @ApiProperty({ example: 3.5, description: 'GPA' })
  gpa?: number;

  @ApiProperty({ example: 3.2, description: 'CGPA' })
  cgpa?: number;

  @ApiProperty({ example: 120, description: 'Credits attempted' })
  creditsAttempted?: number;

  @ApiProperty({ example: 110, description: 'Credits earned' })
  creditsEarned?: number;

  @ApiProperty({ example: 'ACTIVE', description: 'Academic status' })
  status: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Creation date',
  })
  createdAt: Date;
}

export class StudentPromotionResponseDto {
  @ApiProperty({ example: 'prom_123', description: 'Promotion ID' })
  id: string;

  @ApiProperty({ example: '100 Level', description: 'From level' })
  fromLevelName: string;

  @ApiProperty({ example: '200 Level', description: 'To level' })
  toLevelName: string;

  @ApiProperty({ example: '2024/2025', description: 'Session' })
  sessionName: string;

  @ApiProperty({
    example: '2024-09-01T00:00:00.000Z',
    description: 'Promotion date',
  })
  promotionDate: Date;

  @ApiProperty({
    example: 'Promoted based on academic performance',
    description: 'Notes',
  })
  notes?: string;
}

export class StudentResponseDto {
  @ApiProperty({ example: 'stud_123', description: 'Student ID' })
  id: string;

  @ApiProperty({ example: 'user_123', description: 'User ID' })
  userId: string;

  @ApiProperty({ example: 'John Doe', description: 'Student name' })
  name: string;

  @ApiProperty({ example: 'john@example.com', description: 'Student email' })
  email: string;

  @ApiProperty({ example: 'john_doe', description: 'Student username' })
  username: string;

  @ApiProperty({ example: 'inst_123', description: 'Institution ID' })
  institutionId: string;

  @ApiProperty({
    example: 'Lagos State University',
    description: 'Institution name',
  })
  institutionName: string;

  @ApiProperty({ example: 'fac_123', description: 'Faculty ID' })
  facultyId: string;

  @ApiProperty({
    example: 'Faculty of Engineering',
    description: 'Faculty name',
  })
  facultyName: string;

  @ApiProperty({ example: 'dept_123', description: 'Department ID' })
  departmentId: string;

  @ApiProperty({
    example: 'Department of Computer Science',
    description: 'Department name',
  })
  departmentName: string;

  @ApiProperty({ example: 'lvl_123', description: 'Current academic level ID' })
  currentAcademicLevelId?: string;

  @ApiProperty({
    example: '300 Level',
    description: 'Current academic level name',
  })
  currentAcademicLevelName?: string;

  @ApiProperty({ example: 'MAT/2024/001', description: 'Matric number' })
  matricNumber?: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Academic status' })
  academicStatus: string;

  @ApiProperty({
    example: true,
    description: 'Whether onboarding is completed',
  })
  onboardingCompleted: boolean;

  @ApiProperty({ example: 'VERIFIED', description: 'Verification status' })
  verificationStatus: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Creation date',
  })
  createdAt: Date;

  @ApiProperty({
    type: [StudentAcademicRecordResponseDto],
    description: 'Academic records',
  })
  academicRecords?: StudentAcademicRecordResponseDto[];

  @ApiProperty({
    type: [StudentPromotionResponseDto],
    description: 'Promotion history',
  })
  promotions?: StudentPromotionResponseDto[];
}

export class StudentListResponseDto {
  @ApiProperty({ type: [StudentResponseDto] })
  data: StudentResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class StudentDashboardDto {
  @ApiProperty({
    example: {
      total: 1000,
      byStatus: {
        active: 850,
        graduated: 100,
        withdrawn: 30,
        probation: 15,
        suspended: 5,
      },
      byLevel: { '100': 250, '200': 220, '300': 200, '400': 180 },
      byDepartment: {
        'Computer Science': 150,
        Engineering: 120,
        Medicine: 100,
      },
    },
    description: 'Student statistics',
  })
  statistics: {
    total: number;
    byStatus: Record<string, number>;
    byLevel: Record<string, number>;
    byDepartment: Record<string, number>;
  };

  @ApiProperty({
    example: {
      total: 1200,
      active: 950,
      withdrawn: 30,
      recentActivity: [
        { type: 'ENROLLMENT', student: 'John Doe', date: '2024-01-01' },
        { type: 'PROMOTION', student: 'Jane Smith', date: '2024-01-01' },
      ],
    },
    description: 'Recent activity',
  })
  recentActivity: {
    total: number;
    active: number;
    withdrawn: number;
    recentActivity: Array<{
      type: string;
      student: string;
      date: string;
    }>;
  };

  @ApiProperty({
    example: [
      {
        id: 'stud_123',
        name: 'John Doe',
        email: 'john@example.com',
        status: 'ACTIVE',
        matricNumber: 'MAT/2024/001',
      },
    ],
    description: 'Recent students',
  })
  recentStudents: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    matricNumber?: string;
  }>;
}
