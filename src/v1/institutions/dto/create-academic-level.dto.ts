import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class CreateAcademicLevelDto {
  @ApiProperty({ example: '100 Level' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(1)
  @Max(1000)
  numericLevel: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  order: number;

  @ApiProperty({ example: 'cmsz2nuwd00002ptvprnzloq6' })
  @IsString()
  @IsNotEmpty()
  departmentId: string;
}