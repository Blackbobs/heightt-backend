import { ApiProperty } from '@nestjs/swagger';

export class OrganizationMemberResponseDto {
  @ApiProperty({ example: 'mem_123', description: 'Membership ID' })
  id: string;

  @ApiProperty({ example: 'user_123', description: 'User ID' })
  userId: string;

  @ApiProperty({ example: 'John Doe', description: 'User name' })
  userName: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  userEmail: string;

  @ApiProperty({ example: 'STUDENT', description: 'Membership type' })
  membershipType: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Membership status' })
  status: string;

  @ApiProperty({ example: true, description: 'Is primary membership' })
  isPrimary: boolean;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Joined date',
  })
  joinedAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Creation date',
  })
  createdAt: Date;
}

export class OrganizationResponseDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  id: string;

  @ApiProperty({
    example: 'Computer Science Association',
    description: 'Organization name',
  })
  name: string;

  @ApiProperty({ example: 'csa', description: 'Organization slug' })
  slug: string;

  @ApiProperty({
    example: 'The official Computer Science Association',
    description: 'Organization description',
  })
  description?: string;

  @ApiProperty({ example: 'ASSOCIATION', description: 'Organization type' })
  type: string;

  @ApiProperty({ example: 'DEPARTMENT', description: 'Organization scope' })
  scope: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Organization status' })
  status: string;

  @ApiProperty({ example: 'inst_123', description: 'Institution ID' })
  institutionId: string;

  @ApiProperty({ example: 'fac_123', description: 'Faculty ID' })
  facultyId?: string;

  @ApiProperty({ example: 'dept_123', description: 'Department ID' })
  departmentId?: string;

  @ApiProperty({ example: 'lvl_123', description: 'Academic Level ID' })
  academicLevelId?: string;

  @ApiProperty({
    example: 'org_parent_123',
    description: 'Parent organization ID',
  })
  parentOrganizationId?: string;

  @ApiProperty({
    type: [OrganizationResponseDto],
    description: 'Child organizations',
  })
  children?: OrganizationResponseDto[];

  @ApiProperty({
    type: [OrganizationMemberResponseDto],
    description: 'Organization members',
  })
  members?: OrganizationMemberResponseDto[];

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Activation date',
  })
  activatedAt?: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Creation date',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last update date',
  })
  updatedAt: Date;
}

export class OrganizationListResponseDto {
  @ApiProperty({ type: [OrganizationResponseDto] })
  data: OrganizationResponseDto[];

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
