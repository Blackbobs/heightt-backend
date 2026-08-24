// src/v1/institutions/dto/create-faculty.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateFacultyDto {
  @ApiProperty({ example: 'Faculty of Engineering' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'ENG' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'cmsz2nuwd00002ptvprnzloq6' })
  @IsString()
  @IsNotEmpty()
  institutionId: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    description: 'Faculty logo URL (upload via the files module, then pass the URL)',
    required: false,
  })
  @IsOptional()
  @IsString()
  logo?: string;
}
