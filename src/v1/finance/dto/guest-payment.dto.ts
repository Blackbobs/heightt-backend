import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { IsCuidOrUUID } from './create-payment.dto';

export class CreateGuestPaymentDto {
  @IsEmail()
  @MaxLength(254)
  @ApiProperty({ example: 'student@example.com' })
  email: string;

  @IsString()
  @Length(1, 80)
  @ApiProperty({ example: 'Ada' })
  firstName: string;

  @IsString()
  @Length(1, 80)
  @ApiProperty({ example: 'Okafor' })
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ApiPropertyOptional()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @ApiPropertyOptional()
  matricNumber?: string;

  @IsCuidOrUUID()
  @ApiProperty()
  institutionId: string;

  @IsOptional()
  @IsCuidOrUUID()
  @ApiPropertyOptional()
  facultyId?: string;

  @IsOptional()
  @IsCuidOrUUID()
  @ApiPropertyOptional()
  departmentId?: string;

  @IsOptional()
  @IsCuidOrUUID()
  @ApiPropertyOptional()
  academicLevelId?: string;

  @IsCuidOrUUID()
  @ApiProperty({ description: 'The active due being paid' })
  dueId: string;

  @IsEnum(['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE'])
  @ApiProperty({ enum: ['CARD', 'BANK_TRANSFER', 'USSD', 'QR_CODE'] })
  paymentMethod: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  cancelUrl?: string;
}

export class GuestPaymentAccessDto {
  @IsString()
  @Length(32, 256)
  accessToken: string;
}

export class VerifyGuestClaimDto {
  @IsString()
  @Length(6, 6)
  @ApiProperty({ example: '123456' })
  code: string;
}
