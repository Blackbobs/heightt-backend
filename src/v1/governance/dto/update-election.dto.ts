import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateElectionDto {
  @ApiProperty({
    example: '2024 Student Union Elections',
    description: 'Election title',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiProperty({
    example: 'Election for student union representatives',
    description: 'Election description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: '2024-09-01T00:00:00.000Z',
    description: 'Start date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    example: '2024-09-07T23:59:59.000Z',
    description: 'End date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    enum: ['DRAFT', 'NOMINATION', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
    description: 'Election status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'NOMINATION', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
