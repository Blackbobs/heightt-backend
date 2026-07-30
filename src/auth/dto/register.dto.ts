import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
    required: true,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'john_doe',
    description: 'Username - must be unique',
    required: true,
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9_]+$',
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description:
      'Password - at least 8 characters with 1 uppercase, 1 lowercase, and 1 number/special character',
    required: true,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
