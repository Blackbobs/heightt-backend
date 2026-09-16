// src/v1/onboarding/dto/onboarding.dto.ts

import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class OnboardingPersonalInfoDto {
  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  lastName: string;
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

  @ApiProperty({ example: 'MAT/2024/001' })
  @IsString()
  matricNumber: string;

  @ApiProperty({
    description: 'True for 100 level students, false for 200 level and above',
  })
  @IsBoolean()
  isFresher: boolean;
}

export class CompleteOnboardingDto {
  @ApiProperty({ required: false })
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
  matricNumber?: string;

  /** @deprecated Use matricNumber. */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  studentId?: string;

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

  @ApiProperty({
    description: 'True for 100 level students, false for 200 level and above',
  })
  @IsBoolean()
  isFresher: boolean;
}
