import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  IsUrl,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Computer Science Association',
    description: 'Organization name',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'csa',
    description: 'Organization slug (URL-friendly identifier)',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug can only contain lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiProperty({
    example: 'The official Computer Science Association',
    description: 'Organization description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    description:
      'Organization logo URL (upload via the files module, then pass the secure URL)',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  logo?: string;

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
  })
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
  type: string;

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
  })
  @IsEnum([
    'INSTITUTION',
    'FACULTY',
    'DEPARTMENT',
    'LEVEL',
    'CROSS_DEPARTMENT',
    'CROSS_LEVEL',
    'CUSTOM',
  ])
  scope: string;

  @ApiProperty({
    example: 'inst_123',
    description:
      'Institution ID. Required for academic organizations; omit for independent organizations',
    required: false,
  })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiProperty({
    example: 'fac_123',
    description: 'Faculty ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiProperty({
    example: 'dept_123',
    description: 'Department ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({
    example: 'lvl_123',
    description: 'Academic Level ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  academicLevelId?: string;

  @ApiProperty({
    example: 'org_123',
    description: 'Parent Organization ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  parentOrganizationId?: string;

  @ApiProperty({
    example: 'sess_123',
    description: 'Academic session ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  academicSessionId?: string;
}
