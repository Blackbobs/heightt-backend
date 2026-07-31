import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateSavingsGoalDto {
  @ApiProperty({
    example: 'New Laptop Fund',
    description: 'Goal title',
  })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'Saving for a new laptop',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 5000000,
    description:
      'Target amount (in Kobo - 1 NGN = 100 Kobo). E.g., 5000000 = ₦50,000',
    minimum: 100,
  })
  @IsNumber()
  @Min(100, { message: 'Target amount must be at least ₦1 (100 Kobo)' })
  targetAmount: number;

  @ApiProperty({
    example: '2024-12-31T00:00:00.000Z',
    description: 'Target date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
