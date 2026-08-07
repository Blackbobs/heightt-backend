import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsUUID,
  IsOptional,
  IsEnum,
  Min,
  IsUrl,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Amount in Kobo' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'] })
  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'])
  paymentMethod: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dueAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Success URL to redirect after payment',
    example: 'https://yourapp.com/payment/success',
  })
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Cancel URL to redirect if payment is cancelled',
    example: 'https://yourapp.com/payment/cancel',
  })
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}

export class CreateManualPaymentDto {
  @ApiProperty({ description: 'Amount in Kobo' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'] })
  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'])
  paymentMethod: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dueAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Success URL to redirect after payment',
    example: 'https://yourapp.com/payment/success',
  })
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Cancel URL to redirect if payment is cancelled',
    example: 'https://yourapp.com/payment/cancel',
  })
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
