import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID',
  })
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    example: 500000,
    description: 'Amount (in Kobo - 1 NGN = 100 Kobo). E.g., 500000 = ₦5,000',
    minimum: 1,
  })
  @IsNumber()
  @Min(1, { message: 'Amount must be at least 1 Kobo (₦0.01)' })
  amount: number;

  @ApiProperty({
    enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'],
    description: 'Payment method',
  })
  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'])
  paymentMethod: string;

  @ApiProperty({
    example: 'Payment for departmental dues',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'due_123',
    description: 'Due ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  dueId?: string;

  @ApiProperty({
    example: 'due_assignment_123',
    description: 'Due assignment ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  dueAssignmentId?: string;
}
