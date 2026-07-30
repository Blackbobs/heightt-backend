import { ApiProperty } from '@nestjs/swagger';

export class FacultyResponseDto {
  @ApiProperty({ example: 'fac_123', description: 'Faculty ID' })
  id: string;

  @ApiProperty({ example: 'Faculty of Engineering', description: 'Faculty name' })
  name: string;

  @ApiProperty({ example: 'ENG', description: 'Faculty code' })
  code: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Faculty status' })
  status: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Last update date' })
  updatedAt: Date;
}

export class DepartmentResponseDto {
  @ApiProperty({ example: 'dept_123', description: 'Department ID' })
  id: string;

  @ApiProperty({ example: 'Department of Computer Science', description: 'Department name' })
  name: string;

  @ApiProperty({ example: 'CSC', description: 'Department code' })
  code: string;

  @ApiProperty({ example: 'AUTOMATIC', description: 'Promotion type' })
  promotionType: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Department status' })
  status: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Last update date' })
  updatedAt: Date;
}

export class AcademicLevelResponseDto {
  @ApiProperty({ example: 'lvl_123', description: 'Level ID' })
  id: string;

  @ApiProperty({ example: '100 Level', description: 'Level name' })
  name: string;

  @ApiProperty({ example: 100, description: 'Numeric level' })
  numericLevel: number;

  @ApiProperty({ example: 1, description: 'Display order' })
  order: number;

  @ApiProperty({ example: 'ACTIVE', description: 'Level status' })
  status: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Last update date' })
  updatedAt: Date;
}

export class AcademicSessionResponseDto {
  @ApiProperty({ example: 'sess_123', description: 'Session ID' })
  id: string;

  @ApiProperty({ example: '2024/2025', description: 'Session name' })
  name: string;

  @ApiProperty({ example: '2024-09-01T00:00:00.000Z', description: 'Start date' })
  startDate: Date;

  @ApiProperty({ example: '2025-08-31T00:00:00.000Z', description: 'End date' })
  endDate: Date;

  @ApiProperty({ example: 'ACTIVE', description: 'Session status' })
  status: string;

  @ApiProperty({ example: true, description: 'Whether this is the current session' })
  isCurrent: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Last update date' })
  updatedAt: Date;
}

export class InstitutionResponseDto {
  @ApiProperty({ example: 'inst_123', description: 'Institution ID' })
  id: string;

  @ApiProperty({ example: 'Lagos State University', description: 'Institution name' })
  name: string;

  @ApiProperty({ example: 'LASU', description: 'Institution short name' })
  shortName: string;

  @ApiProperty({ example: 'LASU001', description: 'Institution code' })
  code: string;

  @ApiProperty({ example: 'https://lasu.edu.ng/logo.png', description: 'Institution logo URL' })
  logo?: string;

  @ApiProperty({ example: 'https://lasu.edu.ng', description: 'Institution website' })
  website?: string;

  @ApiProperty({ example: 'info@lasu.edu.ng', description: 'Institution email' })
  email?: string;

  @ApiProperty({ example: '+2348012345678', description: 'Institution phone number' })
  phone?: string;

  @ApiProperty({ example: 'Ojo, Lagos', description: 'Institution address' })
  address?: string;

  @ApiProperty({ example: 'Lagos', description: 'City' })
  city?: string;

  @ApiProperty({ example: 'Lagos State', description: 'State' })
  state?: string;

  @ApiProperty({ example: 'Nigeria', description: 'Country' })
  country?: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Institution status' })
  status: string;

  @ApiProperty({ type: [FacultyResponseDto], description: 'Faculties' })
  faculties?: FacultyResponseDto[];

  @ApiProperty({ type: [AcademicSessionResponseDto], description: 'Academic sessions' })
  sessions?: AcademicSessionResponseDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Last update date' })
  updatedAt: Date;
}

export class InstitutionListResponseDto {
  @ApiProperty({ type: [InstitutionResponseDto] })
  data: InstitutionResponseDto[];

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