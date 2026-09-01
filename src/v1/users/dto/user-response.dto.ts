import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class UserProfileResponseDto {
  @ApiProperty({ example: 'John', description: 'User first name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  lastName: string;

  @ApiProperty({
    example: 'Michael',
    description: 'User middle name',
    required: false,
  })
  middleName?: string;

  @ApiProperty({
    example: 'https://cloudinary.com/avatar.jpg',
    description: 'User avatar URL',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
    description: 'User gender',
    required: false,
  })
  gender?: string;

  @ApiProperty({ example: 'Nigeria', description: 'Country', required: false })
  country?: string;

  @ApiProperty({ example: 'PERSONAL_INFO', description: 'Onboarding step' })
  onboardingStep: string;

  @ApiProperty({
    example: false,
    description: 'Whether onboarding is completed',
  })
  onboardingCompleted: boolean;

  @ApiProperty({ example: 'VERIFIED', description: 'Verification status' })
  verificationStatus: string;
}

export class StudentProfileResponseDto {
  @ApiProperty({ example: 'LASU', description: 'Institution name' })
  institutionId: string;

  @ApiProperty({ example: 'Engineering', description: 'Faculty name' })
  facultyId: string;

  @ApiProperty({ example: 'Computer Science', description: 'Department name' })
  departmentId: string;

  @ApiProperty({ example: '300', description: 'Current academic level' })
  currentAcademicLevelId?: string;

  @ApiProperty({
    example: 'MAT/2024/001',
    description: 'Matric number',
    required: false,
  })
  matricNumber?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'],
    description: 'Academic status',
  })
  academicStatus: string;

  @ApiProperty({
    example: false,
    description: 'Whether onboarding is completed',
  })
  onboardingCompleted: boolean;

  @ApiProperty({ example: 'VERIFIED', description: 'Verification status' })
  verificationStatus: string;
}

export class UserResponseDto {
  @ApiProperty({ example: 'usr_abc123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'john_doe', description: 'User username' })
  username: string;

  @ApiProperty({ example: true, description: 'Whether email is verified' })
  emailVerified: boolean;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
    description: 'User status',
  })
  status: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last login date',
  })
  lastLoginAt?: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Account creation date',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last update date',
  })
  updatedAt: Date;

  @ApiProperty({ type: UserProfileResponseDto, description: 'User profile' })
  profile?: UserProfileResponseDto;

  @ApiProperty({
    type: StudentProfileResponseDto,
    description: 'Student profile',
    required: false,
  })
  studentProfile?: StudentProfileResponseDto;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto], description: 'List of users' })
  data: UserResponseDto[];

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

export class UpdateUserDto {
  @ApiProperty({
    example: 'john_updated',
    description: 'Updated username',
    required: false,
  })
  username?: string;

  @ApiPropertyOptional({
    example: 'john@example.com',
    description: 'Email address',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    example: 'John',
    description: 'Updated first name',
    required: false,
  })
  firstName?: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Updated last name',
    required: false,
  })
  lastName?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    example: 'https://cloudinary.com/new-avatar.jpg',
    description: 'Updated avatar URL',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
    description: 'Updated gender',
    required: false,
  })
  gender?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  dateOfBirth?: Date;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Updated country',
    required: false,
  })
  country?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  state?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  bio?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
    description: 'New user status',
  })
  status: string;

  @ApiProperty({
    example: 'Violation of terms of service',
    description: 'Reason for status change',
    required: false,
  })
  reason?: string;
}
