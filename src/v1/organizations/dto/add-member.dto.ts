import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: 'user_123', description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: ['MEMBER', 'STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'],
    description: 'Membership type',
  })
  @IsEnum(['MEMBER', 'STUDENT', 'ADMIN', 'STAFF', 'ALUMNI', 'HONORARY'])
  membershipType: string;

  @ApiProperty({
    enum: ['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'],
    description: 'Membership status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'])
  status?: string;

  @ApiProperty({
    example: true,
    description: 'Set as primary membership',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({
    example: 'sess_123',
    description: 'Academic session ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
