import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateAcademicLevelDto {
  @ApiProperty({ example: '100 Level', description: 'Level name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 100, description: 'Numeric level (for sorting)' })
  @IsNumber()
  @Min(1)
  @Max(1000)
  numericLevel: number;

  @ApiProperty({ example: 1, description: 'Display order' })
  @IsNumber()
  @Min(1)
  order: number;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Department ID (CUID)',
  })
  @IsString()
  departmentId: string;
}
