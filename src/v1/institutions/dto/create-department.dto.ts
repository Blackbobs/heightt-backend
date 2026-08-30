// src/v1/institutions/dto/create-department.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Computer Science' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'CSC' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'cmsz2nuwd00002ptvprnzloq6' })
  @IsString()
  @IsNotEmpty()
  facultyId: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    description: 'Department logo URL (upload via the files module, then pass the URL)',
    required: false,
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ enum: ['AUTOMATIC', 'MANUAL'], required: false })
  @IsOptional()
  @IsString()
  promotionType?: 'AUTOMATIC' | 'MANUAL';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  numberOfLevels?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customLevelNames?: string[];
}
