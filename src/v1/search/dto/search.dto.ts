// src/v1/search/dto/search.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
  IsUUID,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SearchEntityType {
  USERS = 'users',
  ORGANIZATIONS = 'organizations',
  STUDENTS = 'students',
  INSTITUTIONS = 'institutions',
  TRANSACTIONS = 'transactions',
  PAYMENTS = 'payments',
  DUES = 'dues',
  EVENTS = 'events',
  ANNOUNCEMENTS = 'announcements',
  ALL = 'all',
}

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    enum: SearchEntityType,
    default: SearchEntityType.ALL,
  })
  @IsOptional()
  @IsEnum(SearchEntityType)
  entityType?: SearchEntityType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['relevance', 'date', 'name'] })
  @IsOptional()
  @IsEnum(['relevance', 'date', 'name'])
  sortBy?: string = 'relevance';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string = 'desc';
}

export class SearchResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  image?: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  metadata?: any;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  data: SearchResultDto[];

  @ApiProperty()
  meta: {
    query: string;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    took: number;
    entityType?: string;
  };

  @ApiPropertyOptional()
  facets?: {
    users: number;
    organizations: number;
    students: number;
    institutions: number;
    transactions: number;
    payments: number;
    dues: number;
    events: number;
    announcements: number;
  };
}

export class AutoCompleteDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  q: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 5;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class SearchSuggestionDto {
  @ApiProperty()
  text: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  count?: number;
}
