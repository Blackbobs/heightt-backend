import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export class AddAcademicRecordDto {
  @ApiProperty({ example: 'sess_123', description: 'Academic session ID' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ example: 'dept_123', description: 'Department ID' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ example: 'lvl_123', description: 'Academic level ID' })
  @IsUUID()
  academicLevelId: string;

  @ApiProperty({
    example: 3.5,
    description: 'GPA for the session',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  gpa?: number;

  @ApiProperty({ example: 3.2, description: 'CGPA overall', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  cgpa?: number;

  @ApiProperty({
    example: 120,
    description: 'Credits attempted',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditsAttempted?: number;

  @ApiProperty({ example: 110, description: 'Credits earned', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditsEarned?: number;

  @ApiProperty({
    enum: ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'],
    description: 'Academic status after this record',
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'PROBATION', 'SUSPENDED'])
  status?: string;
}
