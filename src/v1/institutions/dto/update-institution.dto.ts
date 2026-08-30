// src/v1/institutions/dto/update-institution.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateInstitutionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  shortName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'])
  status?: string;
}
