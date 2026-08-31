// src/v1/finance/dto/withdrawal.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserWithdrawalRequestDto {
  @ApiProperty({ description: 'Bank account ID to withdraw to' })
  @IsString()
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
  @IsString()
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

export class OrganizationWithdrawalRequestDto {
  @ApiProperty({ description: 'Organization ID whose wallet will be debited' })
  @IsString()
  organizationId: string;

  @ApiProperty({ description: 'Bank account ID to settle into' })
  @IsString()
  bankAccountId: string;

  @ApiProperty({ description: 'Amount in Kobo', minimum: 100 })
  @IsNumber()
  @Min(100)
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

export class WithdrawalQuoteDto {
  @ApiProperty({ enum: WithdrawalType })
  @IsEnum(WithdrawalType)
  type: WithdrawalType;

  @ApiProperty({
    required: false,
    description: 'Required for organisation withdrawals',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiProperty({
    required: false,
    description: 'Requested principal in Kobo',
    minimum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  amount?: number;
}

export class WithdrawalFilterDto {
  @ApiProperty({ required: false, description: 'Organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string;

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
