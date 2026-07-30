import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';

export class RegisterActivityDto {
  @ApiProperty({
    example: 1,
    description: 'Number of tickets',
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
