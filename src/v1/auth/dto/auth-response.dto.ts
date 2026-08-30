// src/v1/auth/dto/auth-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'] })
  status: string;

  @ApiProperty({ type: () => Object, required: false })
  profile?: any;

  @ApiProperty({ type: () => Object, required: false })
  studentProfile?: any;

  @ApiProperty({ required: false })
  createdAt?: Date;

  @ApiProperty({ required: false })
  updatedAt?: Date;

  @ApiProperty({ required: false })
  lastLoginAt?: Date;

  // Admin fields
  @ApiProperty({ required: false, default: false })
  isPlatformAdmin?: boolean;

  @ApiProperty({ type: [String], required: false })
  adminTypes?: string[];

  @ApiProperty({
    enum: ['PLATFORM_ADMIN', 'ADMIN', 'USER', 'STUDENT'],
    required: false,
    default: 'USER',
  })
  userType?: string;

  @ApiProperty({ type: [String], required: false })
  roles?: string[];
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'usr_abc123',
    description: 'User ID',
  })
  id: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
  })
  email: string;

  @ApiProperty({
    example: 'john_doe',
    description: 'User username',
  })
  username: string;

  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  lastName: string;

  @ApiProperty({
    example: false,
    description: 'Whether onboarding is completed',
  })
  onboardingCompleted: boolean;

  @ApiProperty({
    example: 'UNVERIFIED',
    description: 'Verification status',
    enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'],
  })
  verificationStatus: string;

  @ApiProperty({
    example: 'PERSONAL_INFO',
    description: 'Current onboarding step',
    enum: ['PERSONAL_INFO', 'INSTITUTION', 'INTERESTS', 'COMPLETED'],
  })
  onboardingStep: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: 'JWT access token (set in HTTP-only cookie)',
    required: false,
  })
  accessToken?: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: 'JWT refresh token (set in HTTP-only cookie)',
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({
    example:
      'Registration successful. Please check your email for verification.',
    description: 'Response message',
    required: false,
  })
  message?: string;

  // Admin fields for login response
  @ApiProperty({ required: false, default: false })
  isPlatformAdmin?: boolean;

  @ApiProperty({ type: [String], required: false })
  adminTypes?: string[];

  @ApiProperty({
    enum: ['PLATFORM_ADMIN', 'ADMIN', 'USER', 'STUDENT'],
    required: false,
    default: 'USER',
  })
  userType?: string;

  @ApiProperty({ type: [String], required: false })
  roles?: string[];
}

export class AdminLoginResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty()
  isPlatformAdmin: boolean;

  @ApiProperty({ type: [String] })
  adminTypes: string[];

  @ApiProperty({
    enum: [
      'PLATFORM_ADMIN',
      'INSTITUTION_ADMIN',
      'ORGANIZATION_ADMIN',
      'ADMIN',
    ],
  })
  userType: string;

  @ApiProperty({ type: [String] })
  roles: string[];

  @ApiProperty({
    type: () => Object,
    required: false,
  })
  adminScopes?: Array<{
    adminType: string;
    institutionId?: string;
    facultyId?: string;
    departmentId?: string;
    organizationId?: string;
    academicSessionId?: string;
    institutionName?: string;
    facultyName?: string;
    departmentName?: string;
    organizationName?: string;
  }>;

  @ApiProperty()
  isAdminSession: boolean;

  @ApiProperty()
  highestAdminType: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  hasCompletedOnboarding: boolean;

  @ApiProperty()
  onboardingStep: string;

  @ApiProperty({ type: () => Object, required: false })
  profile?: any;
}

export class SessionResponseDto {
  @ApiProperty({
    example: 'sess_abc123',
    description: 'Session ID',
  })
  id: string;

  @ApiProperty({
    example: 'Chrome on Mac OS X',
    description: 'Device name',
  })
  deviceName: string;

  @ApiProperty({
    example: 'Chrome',
    description: 'Browser name',
  })
  browser: string;

  @ApiProperty({
    example: 'Mac OS X',
    description: 'Operating system',
  })
  operatingSystem: string;

  @ApiProperty({
    example: '192.168.1.1',
    description: 'IP address',
  })
  ipAddress: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Session creation date',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last used date',
  })
  lastUsedAt: Date;

  @ApiProperty({
    example: '2024-01-31T00:00:00.000Z',
    description: 'Session expiry date',
  })
  expiresAt: Date;
}
