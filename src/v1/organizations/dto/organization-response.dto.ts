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
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({
    enum: [
      'INSTITUTION',
      'FACULTY',
      'DEPARTMENT',
      'LEVEL',
      'ASSOCIATION',
      'CLUB',
      'RELIGIOUS',
      'SPORTS',
      'SPECIAL',
    ],
  })
  type: string;

  @ApiProperty({
    enum: [
      'INSTITUTION',
      'FACULTY',
      'DEPARTMENT',
      'LEVEL',
      'CROSS_DEPARTMENT',
      'CROSS_LEVEL',
      'CUSTOM',
    ],
  })
  scope: string;

  @ApiProperty({
    enum: [
      'DRAFT',
      'PENDING_ACTIVATION',
      'ACTIVE',
      'INACTIVE',
      'SUSPENDED',
      'ARCHIVED',
    ],
  })
  status: string;

  @ApiProperty()
  institutionId: string;

  @ApiProperty({ required: false })
  facultyId?: string;

  @ApiProperty({ required: false })
  departmentId?: string;

  @ApiProperty({ required: false })
  academicLevelId?: string;

  @ApiProperty({ required: false })
  parentOrganizationId?: string;

  @ApiProperty({ required: false })
  academicSessionId?: string;

  @ApiProperty({ required: false })
  activatedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  institution?: any;

  @ApiProperty({ required: false })
  faculty?: any;

  @ApiProperty({ required: false })
  department?: any;

  @ApiProperty({ required: false })
  academicLevel?: any;

  @ApiProperty({ required: false })
  academicSession?: any;

  @ApiProperty({ required: false })
  parent?: any;

  @ApiProperty({ type: [Object], required: false })
  children?: any[];

  @ApiProperty({ type: [Object], required: false })
  memberships?: any[];

  @ApiProperty({ required: false })
  wallet?: any;
}

export class OrganizationListResponseDto {
  @ApiProperty({ type: [OrganizationResponseDto] })
  data: OrganizationResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
