import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsEnum,
  Min,
} from 'class-validator';

export class CreateDueDto {
  @ApiProperty({
    example: 'cmt0voucd000tljtv2ahkkkap',
    description: 'Organization ID (cuid)',
  })
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({
    example: 'cmt0vabc00000ljtv0000000000',
    description: 'Academic session ID (cuid)',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    example: 'Departmental Dues',
    description: 'Due name',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Payment for departmental activities',
    description: 'Description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 500000,
    description: 'Amount (in Kobo - 1 NGN = 100 Kobo). E.g., 500000 = ₦5,000',
    minimum: 1,
  })
  @IsNumber()
  @Min(1, { message: 'Amount must be at least 1 Kobo (₦0.01)' })
  amount: number;

  @ApiProperty({
    example: '2024-01-31T23:59:59.000Z',
    description: 'Due date',
  })
  @IsDateString()
  dueDate: string;

  @ApiProperty({
    example: 50000,
    description: 'Late fee (in Kobo - 1 NGN = 100 Kobo). E.g., 50000 = ₦500',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFee?: number;

  @ApiProperty({
    example: true,
    description: 'Is required',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED'],
    description: 'Due status (defaults to ACTIVE)',
    required: false,
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'CANCELLED';
}
