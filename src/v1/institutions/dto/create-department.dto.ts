import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({
    example: 'Department of Computer Science',
    description: 'Department name',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'CSC', description: 'Department code' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Faculty ID (CUID)',
  })
  @IsString()
  facultyId: string;

  @ApiProperty({
    enum: ['AUTOMATIC', 'MANUAL'],
    description: 'Promotion type',
    required: false,
    default: 'AUTOMATIC',
  })
  @IsOptional()
  @IsString()
  promotionType?: 'AUTOMATIC' | 'MANUAL';

  @ApiProperty({
    description:
      'Number of academic levels (e.g., 4 for 4-year program, 5 for 5-year program)',
    required: false,
    default: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  numberOfLevels?: number;

  @ApiProperty({
    description:
      'Custom level names (optional - must match numberOfLevels count)',
    example: ['100 Level', '200 Level', '300 Level', '400 Level'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customLevelNames?: string[];
}
