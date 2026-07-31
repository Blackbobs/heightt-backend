import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEnum,
  MinLength,
  MaxLength,
  IsOptional,
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

  @ApiProperty({ example: 'fac_123', description: 'Faculty ID' })
  @IsUUID()
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
}
