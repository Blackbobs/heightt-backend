import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SavingsDepositDto {
  @ApiProperty({
    example: 'goal_123',
    description: 'Savings goal ID',
  })
  @IsUUID()
  goalId: string;

  @ApiProperty({
    example: 500000,
    description:
      'Amount to deposit (in Kobo - 1 NGN = 100 Kobo). E.g., 500000 = ₦5,000',
    minimum: 100,
  })
  @IsNumber()
  @Min(100, { message: 'Minimum deposit is ₦1 (100 Kobo)' })
  amount: number;

  @ApiProperty({
    example: 'Monthly savings',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
