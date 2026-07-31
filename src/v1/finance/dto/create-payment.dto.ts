import { ApiProperty } from '@nestjs/swagger';

// In your DTOs
export class CreatePaymentDto {
  @ApiProperty({ example: 500000, description: 'Amount in Kobo' })
  amount: number;

  @ApiProperty({ example: 'org_123' })
  organizationId: string;

  @ApiProperty({ enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'] })
  paymentMethod: string;

  @ApiProperty({ required: false })
  dueAssignmentId?: string;

  @ApiProperty({ required: false })
  dueId?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Payment channel (web, mobile, etc.)',
  })
  channel?: string;
}
