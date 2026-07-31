import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateFeatureFlagDto {
  @ApiProperty({ example: 'new_dashboard', description: 'Feature key' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'New Dashboard UI', description: 'Feature name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Enable new dashboard design',
    description: 'Feature description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: false,
    description: 'Is feature enabled',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    example: 100,
    description: 'Rollout percentage',
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class UpdateFeatureFlagDto {
  @ApiProperty({
    example: 'New Dashboard UI',
    description: 'Feature name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'Enable new dashboard design',
    description: 'Feature description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Is feature enabled',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    example: 50,
    description: 'Rollout percentage',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class CreateMaintenanceDto {
  @ApiProperty({ example: true, description: 'Enable maintenance mode' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    example: 'System maintenance in progress',
    description: 'Maintenance message',
    required: false,
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Start date',
    required: false,
  })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiProperty({
    example: '2024-01-01T02:00:00.000Z',
    description: 'End date',
    required: false,
  })
  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class CreateKillSwitchDto {
  @ApiProperty({ example: 'payments', description: 'Kill switch key' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Disable Payments', description: 'Kill switch name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Emergency disable of payment processing',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: false, description: 'Is kill switch enabled' })
  @IsBoolean()
  enabled: boolean;
}

export class UpdatePlatformSettingDto {
  @ApiProperty({ example: 'New value', description: 'Setting value' })
  @IsString()
  value: string;

  @ApiProperty({
    example: 'Updated description',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PlatformSettingResponseDto {
  @ApiProperty({ example: 'max_upload_size' })
  key: string;

  @ApiProperty({ example: '10485760' })
  value: string;

  @ApiProperty({ example: 'Maximum file upload size in bytes' })
  description?: string;

  @ApiProperty({ example: true })
  isPublic: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
