import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  MinLength,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'user_123', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'inst_123', description: 'Institution ID' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({ example: 'fac_123', description: 'Faculty ID' })
  @IsUUID()
  facultyId: string;

  @ApiProperty({ example: 'dept_123', description: 'Department ID' })
  @IsUUID()
  departmentId: string;

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
  @MinLength(3)
  @MaxLength(50)
  matricNumber?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'],
    description: 'Academic status',
    required: false,
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'])
  academicStatus?: string;
}
