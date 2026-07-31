import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class DebitWalletDto {
  @ApiProperty({
    example: 'usr_123',
    description: 'User ID',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: 500000,
    description:
      'Amount to debit (in Kobo - 1 NGN = 100 Kobo). E.g., 500000 = ₦5,000',
    minimum: 1,
  })
  @IsNumber()
  @Min(1, { message: 'Amount must be at least 1 Kobo (₦0.01)' })
  amount: number;

  @ApiProperty({
    example: 'Purchase',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'PURCHASE',
    description: 'Transaction type',
    required: false,
  })
  @IsOptional()
  @IsString()
  transactionType?: string;

  @ApiProperty({
    example: 'ref_123',
    description: 'Reference',
    required: false,
  })
  @IsOptional()
  @IsString()
  reference?: string;
}
