import { validate } from 'class-validator';
import {
  CompleteOnboardingDto,
  OnboardingInstitutionDto,
} from './dto/onboarding.dto';

describe('Direct entry onboarding DTOs', () => {
  it.each([CompleteOnboardingDto, OnboardingInstitutionDto])(
    'accepts a boolean direct entry value in %p',
    async (Dto) => {
      const dto = Object.assign(new Dto(), {
        isFresher: false,
        isDirectEntry: true,
      });

      const errors = await validate(dto, { skipMissingProperties: true });

      expect(errors.some((error) => error.property === 'isDirectEntry')).toBe(
        false,
      );
    },
  );

  it.each([CompleteOnboardingDto, OnboardingInstitutionDto])(
    'rejects a non-boolean direct entry value in %p',
    async (Dto) => {
      const dto = Object.assign(new Dto(), {
        isFresher: false,
        isDirectEntry: 'true',
      });

      const errors = await validate(dto, { skipMissingProperties: true });

      expect(errors.some((error) => error.property === 'isDirectEntry')).toBe(
        true,
      );
    },
  );
});
