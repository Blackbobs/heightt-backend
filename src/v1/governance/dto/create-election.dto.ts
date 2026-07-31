import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateElectionDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    example: '2024 Student Union Elections',
    description: 'Election title',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

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
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-09-07T23:59:59.000Z', description: 'End date' })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    enum: ['DRAFT', 'NOMINATION', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
    description: 'Election status',
    required: false,
    default: 'DRAFT',
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'NOMINATION', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      {
        title: 'President',
        description: 'Student Union President',
        maxCandidates: 3,
        maxVotes: 1,
      },
      {
        title: 'Vice President',
        description: 'Student Union Vice President',
        maxCandidates: 3,
        maxVotes: 1,
      },
    ],
    description: 'Positions for the election',
  })
  @IsArray()
  positions: Array<{
    title: string;
    description?: string;
    maxCandidates?: number;
    maxVotes?: number;
    order?: number;
  }>;
}
