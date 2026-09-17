import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsernameAvailabilityController } from './username-availability.controller';

describe('UsernameAvailabilityController', () => {
  function createController(usersService: any) {
    return new UsernameAvailabilityController(usersService);
  }

  it('does not require an authentication guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsernameAvailabilityController),
    ).toBeUndefined();
  });

  it('normalizes a username before checking availability', async () => {
    const usersService = {
      checkUsernameAvailability: jest.fn().mockResolvedValue({
        available: true,
        username: 'john_doe',
        message: 'Username "john_doe" is available',
      }),
      generateUsernameSuggestions: jest.fn(),
    };

    const result =
      await createController(usersService).checkUsernameAvailability(
        '  John_Doe  ',
      );

    expect(usersService.checkUsernameAvailability).toHaveBeenCalledWith(
      'john_doe',
    );
    expect(usersService.generateUsernameSuggestions).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ available: true, suggestions: [] }),
    );
  });

  it.each(['ab', 'john.doe', 'john-doe', 'john doe'])(
    'rejects %s using the registration username rules',
    async (username) => {
      const usersService = {
        checkUsernameAvailability: jest.fn(),
        generateUsernameSuggestions: jest.fn(),
      };

      const result =
        await createController(usersService).checkUsernameAvailability(
          username,
        );

      expect(result.available).toBe(false);
      expect(usersService.checkUsernameAvailability).not.toHaveBeenCalled();
    },
  );

  it('returns suggestions for a taken username', async () => {
    const usersService = {
      checkUsernameAvailability: jest.fn().mockResolvedValue({
        available: false,
        username: 'john_doe',
        message: 'Username "john_doe" is already taken',
      }),
      generateUsernameSuggestions: jest.fn().mockResolvedValue(['johndoe1']),
    };

    const result =
      await createController(usersService).checkUsernameAvailability(
        'john_doe',
      );

    expect(result.suggestions).toEqual(['johndoe1']);
  });
});
