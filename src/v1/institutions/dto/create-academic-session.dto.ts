import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateAcademicSessionDto {
  @ApiProperty({ example: '2024/2025', description: 'Session name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    example: '2024-09-01T00:00:00.000Z',
    description: 'Start date',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-08-31T00:00:00.000Z', description: 'End date' })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Institution ID (CUID)',
  })
  @IsString()
  institutionId: string;

  @ApiProperty({
    enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
    description: 'Session status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

  @ApiProperty({
    example: true,
    description: 'Whether this is the current session',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
