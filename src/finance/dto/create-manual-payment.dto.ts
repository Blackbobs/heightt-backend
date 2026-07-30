import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateManualPaymentDto {
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
    example: 'Event ticket payment',
    description: 'Description',
  })
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty({
    example: 'event_123',
    description: 'Category/Reference ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    enum: ['DUES', 'EVENT', 'MERCHANDISE', 'DONATION', 'SERVICE', 'OTHER'],
    description: 'Payment category',
    required: false,
    default: 'OTHER',
  })
  @IsOptional()
  @IsEnum(['DUES', 'EVENT', 'MERCHANDISE', 'DONATION', 'SERVICE', 'OTHER'])
  category?: string;

  @ApiProperty({
    example: 'event_ticket_123',
    description: 'Reference number',
    required: false,
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    example: 'due_assignment_123',
    description: 'Due assignment ID (if paying dues)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  dueAssignmentId?: string;
}
