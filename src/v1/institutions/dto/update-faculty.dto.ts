import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateFacultyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code?: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], required: false })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

  @ApiProperty({
    required: false,
    description: 'Faculty logo URL (upload via the files module, then pass the URL)',
  })
  @IsOptional()
  @IsString()
  logo?: string;
}