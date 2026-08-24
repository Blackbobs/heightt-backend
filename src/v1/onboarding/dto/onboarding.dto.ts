// src/v1/onboarding/dto/onboarding.dto.ts

import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ example: '+2348012345678', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] })
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender: string;

  @ApiProperty({ example: '2000-01-01' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: '123 Main Street', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
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
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false })
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
