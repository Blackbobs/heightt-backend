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
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

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
    description:
      'Department logo URL (upload via the files module, then pass the URL)',
    required: false,
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ enum: ['AUTOMATIC', 'MANUAL'], required: false })
  @IsOptional()
  @IsString()
  promotionType?: 'AUTOMATIC' | 'MANUAL';

  @ApiProperty({
    required: false,
    minimum: 4,
    maximum: 7,
    example: 5,
    description:
      'Number of academic levels for this department. Supported values are 4, 5, 6, or 7. Defaults based on the department name when omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(4)
  @Max(7)
  numberOfLevels?: number;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level'],
    description:
      'Optional labels in ascending order. When supplied, the array length must equal numberOfLevels.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customLevelNames?: string[];
}
