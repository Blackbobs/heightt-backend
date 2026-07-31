import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CreateFacultyDto {
  @ApiProperty({
    example: 'Faculty of Engineering',
    description: 'Faculty name',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'ENG', description: 'Faculty code' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'inst_123', description: 'Institution ID' })
  @IsUUID()
  institutionId: string;
}
