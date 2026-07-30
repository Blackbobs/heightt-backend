import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({
    example: 'avatars',
    description: 'Folder to upload to',
    required: false,
  })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiProperty({
    example: 'user_123',
    description: 'User ID (for ownership)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID (for ownership)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    example: 'profile_avatar',
    description: 'Purpose of the file',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;
}

export class FileResponseDto {
  @ApiProperty({ example: 'file_123' })
  id: string;

  @ApiProperty({ example: 'https://cloudinary.com/avatar.jpg' })
  url: string;

  @ApiProperty({ example: 'avatar.jpg' })
  filename: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 102400 })
  size: number;

  @ApiProperty({ example: 'avatars' })
  folder: string;

  @ApiProperty({ example: 'user_123' })
  userId?: string;

  @ApiProperty({ example: 'org_123' })
  organizationId?: string;

  @ApiProperty({ example: 'profile_avatar' })
  purpose?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}
