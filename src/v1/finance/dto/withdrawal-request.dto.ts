import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class WithdrawalRequestDto {
  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID (must be admin of this organization)',
  })
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    example: 1000000,
    description:
      'Amount to withdraw (in Kobo - 1 NGN = 100 Kobo). E.g., 1000000 = ₦10,000',
    minimum: 100, // Minimum ₦1
  })
  @IsNumber()
  @Min(100, { message: 'Minimum withdrawal amount is ₦1 (100 Kobo)' })
  amount: number;

  @ApiProperty({
    example: 'GTBank',
    description: 'Bank name',
  })
  @IsString()
  @MaxLength(100)
  bankName: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Account number',
  })
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only numbers' })
  accountNumber: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Account name',
  })
  @IsString()
  @MaxLength(100)
  accountName: string;

  @ApiProperty({
    example: 'Withdrawal for event proceeds',
    description: 'Reason for withdrawal',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
