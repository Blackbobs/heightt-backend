import { ApiProperty } from '@nestjs/swagger';

export class UsernameAvailabilityResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the username is available',
  })
  available: boolean;

  @ApiProperty({
    example: 'john_doe',
    description: 'The username that was checked',
  })
  username: string;

  @ApiProperty({
    example: 'Username "john_doe" is available',
    description: 'Human-readable message',
  })
  message: string;

  @ApiProperty({
    example: ['john_doe1', 'john_doe2', 'john_doe_'],
    description: 'Suggested usernames if the requested one is taken',
    type: [String],
  })
  suggestions: string[];
}

export class EmailAvailabilityResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the email is available',
  })
  available: boolean;

  @ApiProperty({
    example: 'john@example.com',
    description: 'The email that was checked',
  })
  email: string;

  @ApiProperty({
    example: 'Email "john@example.com" is available',
    description: 'Human-readable message',
  })
  message: string;
}
