import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';

export class UpdateStudentDto {
  @ApiProperty({
    example: 'fac_123',
    description: 'Faculty ID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @ApiProperty({
    example: 'dept_123',
    description: 'Department ID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    example: 'lvl_123',
    description: 'Current academic level ID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  currentAcademicLevelId?: string;

  @ApiProperty({
    example: 'MAT/2024/001',
    description: 'Matric number',
    required: false,
  })
  @IsOptional()
  @IsString()
  matricNumber?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'],
    description: 'Academic status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'])
  academicStatus?: string;
}
