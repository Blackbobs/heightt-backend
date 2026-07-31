import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsArray,
} from 'class-validator';

export class CreateExecutiveTermDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ example: '2024/2025 Executive', description: 'Term title' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'Executive team for 2024/2025 session',
    description: 'Term description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: '2024-09-01T00:00:00.000Z',
    description: 'Start date',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-08-31T23:59:59.000Z', description: 'End date' })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    enum: ['UPCOMING', 'ACTIVE', 'COMPLETED'],
    description: 'Term status',
    required: false,
    default: 'UPCOMING',
  })
  @IsOptional()
  @IsEnum(['UPCOMING', 'ACTIVE', 'COMPLETED'])
  status?: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      { userId: 'user_123', roleId: 'role_123' },
      { userId: 'user_456', roleId: 'role_456' },
    ],
    description: 'Executive members',
  })
  @IsArray()
  members: Array<{
    userId: string;
    roleId: string;
  }>;
}
