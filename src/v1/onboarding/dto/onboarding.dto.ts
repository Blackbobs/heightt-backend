// src/v1/onboarding/dto/onboarding.dto.ts

import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';

export class OnboardingPersonalInfoDto {
  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  lastName: string;

  @ApiProperty({
    example: 'Michael',
    description: 'Middle name',
    required: false,
  })
  @IsOptional()
  @IsString()
  middleName?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] })
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  state?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  city?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  address?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  bio?: string;
}

export class OnboardingInstitutionDto {
  @ApiProperty({ example: 'inst_123' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({ example: 'fac_123' })
  @IsUUID()
  facultyId: string;

  @ApiProperty({ example: 'dept_123' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ example: 'lvl_123' })
  @IsUUID()
  levelId: string;

  @ApiProperty({ example: 'MAT/2024/001', required: false })
  @IsOptional()
  @IsString()
  matricNumber?: string;
}

export class CompleteOnboardingDto {
  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gender?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  country?: string;

  /** @deprecated Accepted during the frontend rollout but never persisted. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  faculty?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  academicLevelId?: string;

  // NEW: Session ID
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
