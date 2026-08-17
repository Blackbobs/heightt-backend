import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateOrganizationDto {
  @ApiProperty({
    example: 'Computer Science Association',
    description: 'Organization name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    example: 'csa',
    description: 'Organization slug',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug can only contain lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiProperty({
    example: 'The official Computer Science Association',
    description: 'Organization description',
    required: false,
  })
  @IsOptional()
  @IsString()
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
    description: 'Organization type',
    required: false,
  })
  @IsOptional()
  @IsEnum([
    'INSTITUTION',
    'FACULTY',
    'DEPARTMENT',
    'LEVEL',
    'ASSOCIATION',
    'CLUB',
    'RELIGIOUS',
    'SPORTS',
    'SPECIAL',
  ])
  type?: string;

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
    description: 'Organization scope',
    required: false,
  })
  @IsOptional()
  @IsEnum([
    'INSTITUTION',
    'FACULTY',
    'DEPARTMENT',
    'LEVEL',
    'CROSS_DEPARTMENT',
    'CROSS_LEVEL',
    'CUSTOM',
  ])
  scope?: string;

  @ApiProperty({
    example: 'fac_123',
    description: 'Faculty ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiProperty({
    example: 'dept_123',
    description: 'Department ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({
    example: 'lvl_123',
    description: 'Academic Level ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  academicLevelId?: string;

  @ApiProperty({
    enum: [
      'DRAFT',
      'PENDING_ACTIVATION',
      'ACTIVE',
      'INACTIVE',
      'SUSPENDED',
      'ARCHIVED',
    ],
    description: 'Organization status',
    required: false,
  })
  @IsOptional()
  @IsEnum([
    'DRAFT',
    'PENDING_ACTIVATION',
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'ARCHIVED',
  ])
  status?: string;
}

