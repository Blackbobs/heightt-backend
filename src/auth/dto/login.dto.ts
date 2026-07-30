import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'john@example.com or john_doe',
    description: 'Email or username',
    required: true,
  })
  @IsString()
  @MinLength(3, {
    message: 'Username or email must be at least 3 characters long',
  })
  identifier: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'User password',
    required: true,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
