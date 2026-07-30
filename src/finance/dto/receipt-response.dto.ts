import { ApiProperty } from '@nestjs/swagger';

export class ReceiptResponseDto {
  @ApiProperty({ example: 'rec_123', description: 'Receipt ID' })
  id: string;

  @ApiProperty({ example: 'RCP-2024-0001', description: 'Receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: 'PAY_abc123', description: 'Payment reference' })
  reference: string;

  @ApiProperty({ example: 500000, description: 'Amount (in Kobo)' })
  amount: number;

  @ApiProperty({ example: 0, description: 'Service fee (in Kobo)' })
  serviceFee: number;

  @ApiProperty({ example: 500000, description: 'Total amount (in Kobo)' })
  totalAmount: number;

  @ApiProperty({ example: 'NGN', description: 'Currency' })
  currency: string;

  @ApiProperty({ example: 'John Doe', description: 'Payer name' })
  payerName: string;

  @ApiProperty({ example: 'john@example.com', description: 'Payer email' })
  payerEmail: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Payer phone',
    required: false,
  })
  payerPhone?: string;

  @ApiProperty({
    enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE', 'WALLET'],
    description: 'Payment method',
  })
  paymentMethod: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Payment date',
  })
  paymentDate: Date;

  @ApiProperty({
    example: 'Payment for departmental dues',
    description: 'Description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    example: 'Computer Science Association',
    description: 'Organization name',
    required: false,
  })
  organizationName?: string;

  @ApiProperty({
    enum: ['ISSUED', 'VOIDED', 'CANCELLED'],
    description: 'Receipt status',
  })
  status: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Created at',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Updated at',
  })
  updatedAt: Date;

  @ApiProperty({ example: 5, description: 'Download count' })
  downloadCount: number;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last downloaded',
    required: false,
  })
  lastDownloaded?: Date;
}

export class ReceiptListResponseDto {
  @ApiProperty({ type: [ReceiptResponseDto] })
  data: ReceiptResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class GenerateReceiptDto {
  @ApiProperty({ example: 'pay_123', description: 'Payment ID' })
  paymentId: string;

  @ApiProperty({ example: 'John Doe', description: 'Payer name' })
  payerName: string;

  @ApiProperty({ example: 'john@example.com', description: 'Payer email' })
  payerEmail: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Payer phone',
    required: false,
  })
  payerPhone?: string;

  @ApiProperty({
    example: 'Payment for departmental dues',
    description: 'Description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: 'number' },
        price: { type: 'number' },
      },
    },
    description: 'Items purchased',
    required: false,
  })
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
}
