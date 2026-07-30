import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateWalletDto {
  @ApiProperty({
    example: 'user_123',
    description: 'User ID (optional if organization)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID (optional if user)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    example: 'NGN',
    description: 'Currency',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}
