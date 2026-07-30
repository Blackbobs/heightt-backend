import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class RequestWithdrawalDto {
  @ApiProperty({ example: 10000, description: 'Amount to withdraw' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'GTBank', description: 'Bank name' })
  @IsString()
  bankName: string;

  @ApiProperty({ example: '0123456789', description: 'Account number' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'John Doe', description: 'Account name' })
  @IsString()
  accountName: string;
}
