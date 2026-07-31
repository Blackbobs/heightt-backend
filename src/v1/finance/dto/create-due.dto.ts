import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateDueDto {
  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID',
  })
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    example: 'sess_123',
    description: 'Academic session ID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
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
}
