import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateInstitutionDto {
  @ApiProperty({
    example: 'Lagos State University',
    description: 'Institution name',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'LASU',
    description: 'Institution short name/abbreviation',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  shortName: string;

  @ApiProperty({ example: 'LASU001', description: 'Institution unique code' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  code: string;

  @ApiProperty({
    example: 'https://lasu.edu.ng/logo.png',
    description: 'Institution logo URL',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiProperty({
    example: 'https://lasu.edu.ng',
    description: 'Institution website',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({
    example: 'info@lasu.edu.ng',
    description: 'Institution email',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Institution phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'Ojo, Lagos',
    description: 'Institution address',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Lagos', description: 'City', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    example: 'Lagos State',
    description: 'State',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: 'Nigeria', description: 'Country', required: false })
  @IsOptional()
  @IsString()
  country?: string;
}
