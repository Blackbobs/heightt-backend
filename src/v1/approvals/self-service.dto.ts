import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SelfServiceOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  logo?: string;

  @IsEnum(['ASSOCIATION', 'CLUB', 'RELIGIOUS', 'SPORTS', 'SPECIAL'])
  type: 'ASSOCIATION' | 'CLUB' | 'RELIGIOUS' | 'SPORTS' | 'SPECIAL';

  @IsEnum(['CUSTOM', 'CROSS_DEPARTMENT', 'CROSS_LEVEL'])
  scope: 'CUSTOM' | 'CROSS_DEPARTMENT' | 'CROSS_LEVEL';

  @IsOptional()
  @IsString()
  institutionId?: string;

  @IsOptional()
  @IsString()
  facultyId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
