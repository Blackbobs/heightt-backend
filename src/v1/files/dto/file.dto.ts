// src/v1/files/dto/file.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsUrl,
  Min,
  IsArray,
} from 'class-validator';

export enum FilePurpose {
  AVATAR = 'avatar',
  RECEIPT = 'receipt',
  DOCUMENT = 'document',
  EVENT_BANNER = 'event_banner',
  PROFILE = 'profile',
  VERIFICATION = 'verification',
  STUDENT_DOCUMENT = 'student_document',
  PROMOTION_DOCUMENT = 'promotion_document',
  LOGO = 'logo',
}

export class UploadFileDto {
  @ApiProperty({ description: 'File URL from Cloudinary' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Generated filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'Original filename' })
  @IsString()
  originalName: string;

  @ApiProperty({ description: 'MIME type' })
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  size: number;

  @ApiProperty({ description: 'Folder path' })
  @IsString()
  folder: string;

  @ApiProperty({ description: 'Cloudinary public ID' })
  @IsString()
  publicId: string;

  @ApiPropertyOptional({ enum: FilePurpose })
  @IsOptional()
  @IsEnum(FilePurpose)
  purpose?: FilePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  receiptId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any;
}

export class FileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  size: number;

  @ApiProperty()
  url: string;

  @ApiProperty()
  publicId: string;

  @ApiProperty()
  folder: string;

  @ApiPropertyOptional()
  purpose?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  organizationId?: string;

  @ApiPropertyOptional()
  receiptId?: string;

  @ApiPropertyOptional()
  studentId?: string;

  @ApiPropertyOptional()
  eventId?: string;

  @ApiPropertyOptional()
  isDeleted?: boolean;

  @ApiPropertyOptional()
  metadata?: any;
}

export class FileListResponseDto {
  @ApiProperty({ type: [FileResponseDto] })
  data: FileResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class GetUploadUrlDto {
  @ApiPropertyOptional({ example: 'uploads/avatars' })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional({ enum: FilePurpose })
  @IsOptional()
  @IsEnum(FilePurpose)
  purpose?: FilePurpose;
}

export class DeleteFilesDto {
  @ApiProperty({ type: [String], description: 'Array of file IDs to delete' })
  @IsArray()
  @IsUUID('4', { each: true })
  fileIds: string[];
}

export class FileStatsResponseDto {
  @ApiProperty()
  totalFiles: number;

  @ApiProperty()
  totalSize: number;

  @ApiProperty()
  totalSizeFormatted: string;

  @ApiProperty()
  byPurpose: Record<string, number>;

  @ApiProperty()
  recentUploads: number;
}
