import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
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
    example: true,
    description: 'Whether email is verified',
  })
  emailVerified: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether onboarding is completed',
  })
  onboardingCompleted: boolean;

  @ApiProperty({
    example: 'VERIFIED',
    description: 'Verification status',
    enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'],
  })
  verificationStatus: string;

  @ApiProperty({
    example: 'COMPLETED',
    description: 'Current onboarding step',
    enum: ['PERSONAL_INFO', 'INSTITUTION', 'INTERESTS', 'COMPLETED'],
  })
  onboardingStep: string;

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
