import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

export class UpdateActivityDto {
  @ApiProperty({
    example: 'Tech Conference 2024',
    description: 'Activity title',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiProperty({
    example: 'Annual technology conference',
    description: 'Activity description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'Conference Hall A',
    description: 'Activity location',
    required: false,
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    example: '2024-09-15T09:00:00.000Z',
    description: 'Start date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    example: '2024-09-15T17:00:00.000Z',
    description: 'End date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    example: 100,
    description: 'Activity capacity',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity?: number;

  @ApiProperty({
    example: false,
    description: 'Is the activity free?',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiProperty({
    example: 5000,
    description: 'Ticket price (in Kobo)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({
    enum: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
    description: 'Activity status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    example: true,
    description: 'Is this a public event?',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
