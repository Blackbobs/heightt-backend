import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export class AdminUpdateUserDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'User email',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: 'john_doe',
    description: 'User username',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
    description: 'User status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'])
  status?: string;

  @ApiProperty({
    example: true,
    description: 'Whether email is verified',
    required: false,
  })
  @IsOptional()
  emailVerified?: boolean;

  @ApiProperty({ example: 'John', description: 'First name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Doe', description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class AdminUserFilterDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Filter by email',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: 'john_doe',
    description: 'Filter by username',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
    description: 'Filter by status',
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'])
  status?: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Filter by creation date (start)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiProperty({
    example: '2024-01-31T00:00:00.000Z',
    description: 'Filter by creation date (end)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;
}
