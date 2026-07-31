import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsUrl,
} from 'class-validator';

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
    enum: [
      'avatar',
      'receipt',
      'document',
      'event_banner',
      'profile',
      'verification',
    ],
    description: 'Purpose of the file',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiProperty({
    example: 'receipt_123',
    description: 'Receipt ID (if receipt attachment)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  receiptId?: string;

  @ApiProperty({
    example: 'student_123',
    description: 'Student ID (if student document)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiProperty({
    example: 'event_123',
    description: 'Event ID (if event banner)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class FileResponseDto {
  @ApiProperty({ example: 'file_123' })
  id: string;

  @ApiProperty({ example: 'https://cloudinary.com/avatar.jpg' })
  url: string;

  @ApiProperty({ example: 'avatar.jpg' })
  filename: string;

  @ApiProperty({ example: 'avatar_original.jpg' })
  originalName: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 102400 })
  size: number;

  @ApiProperty({ example: 'avatars' })
  folder: string;

  @ApiProperty({ example: 'avatar' })
  purpose?: string;

  @ApiProperty({ example: 'user_123' })
  userId?: string;

  @ApiProperty({ example: 'org_123' })
  organizationId?: string;

  @ApiProperty({ example: 'receipt_123' })
  receiptId?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}

export class FileListResponseDto {
  @ApiProperty({ type: [FileResponseDto] })
  data: FileResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class GetUploadUrlDto {
  @ApiProperty({
    example: 'avatars',
    description: 'Folder to upload to',
    required: false,
  })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiProperty({
    enum: [
      'avatar',
      'receipt',
      'document',
      'event_banner',
      'profile',
      'verification',
    ],
    description: 'Purpose of the file',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;
}
