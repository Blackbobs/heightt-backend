import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateFacultyDto {
  @ApiProperty({
    example: 'Faculty of Engineering',
    description: 'Faculty name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'ENG', description: 'Faculty code', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
    description: 'Faculty status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}
