import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Custom validation decorator for Cuid or UUID
 * Cuid format: starts with 'c' followed by 24 alphanumeric characters (total 25)
 * UUID format: standard UUID v4 format with hyphens
 */
export function IsCuidOrUUID() {
  return function (object: Object, propertyName: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{24}$/;

    // Use Matches validator with combined regex
    Matches(new RegExp(`^(${uuidRegex.source}|${cuidRegex.source})$`), {
      message: `${propertyName} must be a valid UUID or Cuid (e.g., 550e8400-e29b-41d4-a716-446655440000 or c12345678901234567890123)`,
    })(object, propertyName);
  };
}

export class CreatePaymentDto {
  @ApiProperty({
    description:
      'Amount in Kobo (e.g., 5000 = ₦50.00). ' +
      'Note: Bachs checkout requires a minimum of 10000 Kobo (₦100)',
    example: 10000,
    minimum: 10000,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    description: 'Organization ID (UUID or Cuid)',
    example: 'cmt0voucd000tljtv2ahkkkap',
  })
  @IsCuidOrUUID()
  organizationId: string;

  @ApiProperty({
    description: 'Payment method',
    enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'],
    example: 'CARD',
  })
  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'])
  paymentMethod: string;

  @ApiPropertyOptional({
    description:
      'Due assignment ID (UUID or Cuid) - Use this only if the due is already assigned to the student. Virtual due_* IDs are ignored when dueId is provided.',
    example: 'cmt6oekry0000ugtv7e7fjxi6',
  })
  @Transform(({ value, obj }) =>
    typeof value === 'string' && value.startsWith('due_') && obj.dueId
      ? undefined
      : value,
  )
  @IsOptional()
  @IsCuidOrUUID()
  dueAssignmentId?: string;

  @ApiPropertyOptional({
    description:
      'Due ID (UUID or Cuid) - Use this to auto-assign the due to the student on payment',
    example: 'cmt6oekry0000ugtv7e7fjxi6',
  })
  @IsOptional()
  @IsCuidOrUUID()
  dueId?: string;

  @ApiPropertyOptional({
    description: 'Description of the payment',
    example: 'Department Due Payment',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Success URL to redirect after payment',
    example: 'http://localhost:3001/dashboard/payments?status=success',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false, // Allow localhost URLs
    require_protocol: true, // Require http:// or https://
  })
  @MaxLength(2048)
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Cancel URL to redirect if payment is cancelled',
    example: 'http://localhost:3001/dashboard/payments?status=cancelled',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false, // Allow localhost URLs
    require_protocol: true, // Require http:// or https://
  })
  @MaxLength(2048)
  cancelUrl?: string;
}

export class CreateManualPaymentDto {
  @ApiProperty({
    description: 'Amount in Kobo (e.g., 5000 = ₦50.00)',
    example: 5000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    description: 'Organization ID (UUID or Cuid)',
    example: 'cmt0voucd000tljtv2ahkkkap',
  })
  @IsCuidOrUUID()
  organizationId: string;

  @ApiProperty({
    description: 'Payment method',
    enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'],
    example: 'BANK_TRANSFER',
  })
  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'])
  paymentMethod: string;

  @ApiPropertyOptional({
    description: 'Due assignment ID (UUID or Cuid)',
    example: 'cmt6oekry0000ugtv7e7fjxi6',
  })
  @IsOptional()
  @IsCuidOrUUID()
  dueAssignmentId?: string;

  @ApiPropertyOptional({
    description: 'Description of the payment',
    example: 'Manual payment for dues',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Custom reference for the payment',
    example: 'MANUAL_REF_001',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Category of the payment',
    example: 'DUES',
    enum: ['DUES', 'FEES', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Category specific ID (UUID or Cuid)',
    example: 'cmt6oekry0000ugtv7e7fjxi6',
  })
  @IsOptional()
  @IsCuidOrUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Success URL to redirect after payment',
    example: 'http://localhost:3001/dashboard/payments?status=success',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false, // Allow localhost URLs
    require_protocol: true, // Require http:// or https://
  })
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Cancel URL to redirect if payment is cancelled',
    example: 'http://localhost:3001/dashboard/payments?status=cancelled',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false, // Allow localhost URLs
    require_protocol: true, // Require http:// or https://
  })
  cancelUrl?: string;
}
