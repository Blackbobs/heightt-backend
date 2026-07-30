import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateDepartmentDto {
  @ApiProperty({
    example: 'Department of Computer Science',
    description: 'Department name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'CSC',
    description: 'Department code',
    required: false,
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    enum: ['AUTOMATIC', 'MANUAL'],
    description: 'Promotion type',
    required: false,
  })
  @IsOptional()
  @IsString()
  promotionType?: 'AUTOMATIC' | 'MANUAL';

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
    description: 'Department status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}
