// src/v1/institutions/dto/create-institution.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSessionDto {
  @ApiProperty({
    example: '2026/2027',
    description: 'Session name (format: YYYY/YYYY)',
  })
  @IsString()
  @MinLength(9)
  @MaxLength(9)
  name: string;

  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Start date',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2027-08-31T23:59:59.000Z',
    description: 'End date',
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
    default: 'UPCOMING',
    required: false,
  })
  @IsOptional()
  @IsEnum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
  status?: string;

  @ApiProperty({
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class CreateInstitutionDto {
  @ApiProperty({
    example: 'Federal University of Agriculture, Abeokuta',
    description: 'Institution name',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiProperty({
    example: 'FUNAAB',
    description: 'Short name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string;

  @ApiProperty({
    example: 'FUNAAB',
    description: 'Institution code (must be unique)',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({
    example: 'https://example.com/logo.png',
    description: 'Logo URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({
    example: 'https://example.edu',
    description: 'Website URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({
    example: 'info@example.edu',
    description: 'Email address',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '123 University Road',
    description: 'Address',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    example: 'Abeokuta',
    description: 'City',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    example: 'Ogun',
    description: 'State',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Country',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({
    type: [CreateSessionDto],
    description: 'Academic sessions',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSessionDto)
  sessions?: CreateSessionDto[];
}
