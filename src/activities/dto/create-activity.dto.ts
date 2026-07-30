import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateActivityDto {
  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID (optional for public events)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    example: 'Tech Conference 2024',
    description: 'Activity title',
  })
  @IsString()
  @MaxLength(255)
  title: string;

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
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-09-15T17:00:00.000Z', description: 'End date' })
  @IsDateString()
  endDate: string;

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
    default: true,
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
    example: true,
    description: 'Is this a public event? (Anyone can see and register)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({
    enum: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
    description: 'Activity status',
    required: false,
    default: 'DRAFT',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
