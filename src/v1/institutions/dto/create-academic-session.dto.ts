// src/v1/institutions/dto/create-academic-session.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';

export enum SessionScope {
  INSTITUTION = 'INSTITUTION',
  FACULTY = 'FACULTY',
  DEPARTMENT = 'DEPARTMENT',
  LEVEL = 'LEVEL',
}

export class CreateAcademicSessionDto {
  @ApiProperty({ description: 'Session name (e.g., 2026/2027)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Institution ID' })
  @IsString()
  @IsNotEmpty()
  institutionId: string;

  @ApiProperty({ required: false, description: 'Faculty ID' })
  @IsString()
  @IsOptional()
  facultyId?: string;

  @ApiProperty({ required: false, description: 'Department ID' })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ required: false, description: 'Academic Level ID' })
  @IsString()
  @IsOptional()
  academicLevelId?: string;

  @ApiProperty({ enum: SessionScope, default: SessionScope.INSTITUTION })
  @IsEnum(SessionScope)
  @IsOptional()
  scope?: SessionScope;

  @ApiProperty({ description: 'Start date' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'End date' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'], default: 'UPCOMING' })
  @IsEnum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
  @IsOptional()
  status?: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  @IsOptional()
  isCurrent?: boolean;
}

// Fix the Update DTO - don't use Partial as a value
export class UpdateAcademicSessionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  facultyId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  academicLevelId?: string;

  @ApiProperty({ enum: SessionScope, required: false })
  @IsEnum(SessionScope)
  @IsOptional()
  scope?: SessionScope;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'], required: false })
  @IsEnum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isCurrent?: boolean;
}

// Export response DTO
export class AcademicSessionResponseDto {
  id: string;
  name: string;
  institutionId: string;
  facultyId?: string;
  departmentId?: string;
  academicLevelId?: string;
  scope: SessionScope;
  startDate: Date;
  endDate: Date;
  status: string;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}