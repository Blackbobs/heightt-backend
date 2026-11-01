import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsPositive, Min } from 'class-validator';

export class SearchReceiptByEmailDto {
  @ApiProperty({
    example: 'student@example.com',
    description: 'Payer email address to search receipts for',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @IsPositive()
  page?: number;

  @ApiPropertyOptional({ example: 10, description: 'Items per page' })
  @IsOptional()
  @IsPositive()
  @Min(1)
  limit?: number;
}
