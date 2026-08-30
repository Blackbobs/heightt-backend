// src/v1/finance/dto/bank-account.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'GTBank', description: 'Bank name' })
  @IsString()
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ example: '0123456789', description: 'Account number' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only numbers' })
  accountNumber: string;

  @ApiProperty({ example: 'John Doe', description: 'Account name' })
  @IsString()
  @MaxLength(100)
  accountName: string;

  @ApiProperty({
    example: '058',
    description: 'Provider-supported bank code selected from the bank list',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateBankAccountDto {
  @ApiProperty({ example: 'GTBank', description: 'Bank name', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Account number',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only numbers' })
  accountNumber?: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Account name',
    required: false,
  })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiProperty({ example: '058', description: 'Bank code', required: false })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ResolveBankAccountDto {
  @ApiProperty({
    example: '058',
    description: 'Code returned by the banks endpoint',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0123456789', description: 'Bank account number' })
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only numbers' })
  accountNumber: string;
}
