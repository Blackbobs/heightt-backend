import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({
    enum: ['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'],
    description: 'Membership status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'])
  status?: string;

  @ApiProperty({
    enum: ['MEMBER', 'STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'],
    description: 'Membership type',
    required: false,
  })
  @IsOptional()
  @IsEnum(['MEMBER', 'STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'])
  membershipType?: string;

  @ApiProperty({
    example: true,
    description: 'Set as primary membership',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
