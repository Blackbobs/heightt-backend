// src/v1/finance/dto/assign-due.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class AssignDueDto {
  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsOptional()
  studentIds?: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  levelId?: string;

  // Add organizationId field
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  organizationId?: string;
}
