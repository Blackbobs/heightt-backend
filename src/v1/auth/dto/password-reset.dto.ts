import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Single-use token from the password reset email',
    example: 'a'.repeat(64),
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, { message: 'Reset token is invalid' })
  token: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  newPassword: string;
}
