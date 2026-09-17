import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Cache } from '../../common/decorators/cache.decorator';
import { UsernameAvailabilityResponseDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsernameAvailabilityController {
  constructor(private readonly usersService: UsersService) {}

  @Get('check-username')
  @ApiOperation({
    summary: 'Check username availability',
    description:
      'Public endpoint for checking whether a username can be used during registration',
  })
  @ApiQuery({
    name: 'username',
    description: 'Username to check',
    required: true,
    example: 'john_doe',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Username availability status',
    type: UsernameAvailabilityResponseDto,
  })
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      return `username:check:${request.query.username}`;
    },
    ttl: 60,
    tags: ['users', 'username'],
  })
  async checkUsernameAvailability(@Query('username') rawUsername?: string) {
    const username = rawUsername?.trim().toLowerCase();

    if (!username) {
      return {
        available: false,
        username,
        message: 'Username is required',
        suggestions: [],
      };
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return {
        available: false,
        username,
        message:
          'Username must be 3-30 characters and can only contain letters, numbers, and underscores',
        suggestions: [],
      };
    }

    const result = await this.usersService.checkUsernameAvailability(username);
    const suggestions = result.available
      ? []
      : await this.usersService.generateUsernameSuggestions(username);

    return { ...result, suggestions };
  }
}
