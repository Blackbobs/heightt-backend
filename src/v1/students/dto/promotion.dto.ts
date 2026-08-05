// src/v1/students/dto/promotion.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

export class PromoteStudentDto {
  @ApiProperty({ description: 'From academic level ID' })
  @IsUUID()
  fromLevelId: string;

  @ApiProperty({ description: 'To academic level ID' })
  @IsUUID()
  toLevelId: string;

  @ApiProperty({ description: 'Academic session ID' })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  promotionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkPromoteDto {
  @ApiProperty({ description: 'From academic level ID' })
  @IsUUID()
  fromLevelId: string;

  @ApiProperty({ description: 'To academic level ID' })
  @IsUUID()
  toLevelId: string;

  @ApiProperty({ description: 'Academic session ID' })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({ description: 'Department ID to filter students' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Student IDs to promote' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Promote all eligible students' })
  @IsOptional()
  @IsBoolean()
  promoteAll?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class PromotionResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  studentId: string;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  promotionId?: string;
}

export class PromotionHistoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty()
  fromLevelId: string;

  @ApiProperty()
  fromLevelName: string;

  @ApiProperty()
  toLevelId: string;

  @ApiProperty()
  toLevelName: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  sessionName: string;

  @ApiProperty()
  promotionDate: Date;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  promotedBy: string;

  @ApiProperty()
  promotedByName: string;
}
