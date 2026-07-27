import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3, {
    message: 'Username or email must be at least 3 characters long',
  })
  identifier: string; // Can be username OR email

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
