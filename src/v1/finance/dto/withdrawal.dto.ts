// src/v1/finance/dto/withdrawal.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';

export class UserWithdrawalRequestDto {
  @ApiProperty({ description: 'Bank account ID to withdraw to' })
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({
    example: 1000000,
    description: 'Amount to withdraw (in Kobo)',
    minimum: 100,
  })
  @IsNumber()
  @Min(100, { message: 'Minimum withdrawal amount is ₦1 (100 Kobo)' })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PlatformWithdrawalRequestDto {
  @ApiProperty({ description: 'Bank account ID to withdraw to' })
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({
    example: 10000000,
    description: 'Amount to withdraw (in Kobo)',
    minimum: 100,
  })
  @IsNumber()
  @Min(100, { message: 'Minimum withdrawal amount is ₦1 (100 Kobo)' })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export enum WithdrawalType {
  USER = 'USER',
  ORGANIZATION = 'ORGANIZATION',
  PLATFORM = 'PLATFORM',
}

export class WithdrawalFilterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(WithdrawalType)
  type?: WithdrawalType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;
}
