// src/v1/institutions/dto/institution-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { AcademicSessionResponseDto } from './create-academic-session.dto';

export class InstitutionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  shortName: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ required: false })
  logo?: string;

  @ApiProperty({ required: false })
  website?: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  address?: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty({ required: false })
  state?: string;

  @ApiProperty({ required: false })
  country?: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] })
  status: string;

  @ApiProperty({ type: [Object], required: false })
  faculties?: any[];

  @ApiProperty({ type: [AcademicSessionResponseDto], required: false })
  sessions?: AcademicSessionResponseDto[];

  @ApiProperty({ type: [Object], required: false })
  organizations?: any[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class InstitutionListResponseDto {
  @ApiProperty({ type: [InstitutionResponseDto] })
  data: InstitutionResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
