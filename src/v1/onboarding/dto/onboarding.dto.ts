import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsDateString,
  IsPhoneNumber,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OnboardingPersonalInfoDto {
  @ApiProperty({ description: 'First name', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ description: 'Last name', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ description: 'Middle name', required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  middleName?: string;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;

  @ApiProperty({ description: 'Avatar URL', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    description: 'Gender',
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;

  @ApiProperty({ description: 'Date of birth (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ description: 'Country', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ description: 'State/Province', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ description: 'City', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ description: 'Address', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Bio/About me', required: false })
  @IsOptional()
  @IsString()
  bio?: string;
}

export class OnboardingInstitutionDto {
  @ApiProperty({ description: 'Institution ID' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({ description: 'Faculty ID' })
  @IsUUID()
  facultyId: string;

  @ApiProperty({ description: 'Department ID' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ description: 'Academic level ID' })
  @IsUUID()
  levelId: string;

  @ApiProperty({ description: 'Matric number', required: false })
  @IsOptional()
  @IsString()
  matricNumber?: string;
}

export class OnboardingStatusResponseDto {
  @ApiProperty({ description: 'Current onboarding step' })
  onboardingStep: string;

  @ApiProperty({ description: 'Whether onboarding is completed' })
  onboardingCompleted: boolean;

  @ApiProperty({ description: 'Progress details' })
  progress: {
    personalInfo: {
      completed: boolean;
      required: string[];
      missing: string[];
    };
    institutionInfo: {
      completed: boolean;
      required: string[];
      missing: string[];
    };
  };

  @ApiProperty({ description: 'Whether user has a student profile' })
  hasStudentProfile: boolean;

  @ApiProperty({ description: 'When onboarding was completed', nullable: true })
  completedAt: Date | null;
}

export class CheckOnboardingResponseDto {
  @ApiProperty({ description: 'Whether user needs to complete onboarding' })
  needsOnboarding: boolean;

  @ApiProperty({ description: 'Whether onboarding is completed' })
  onboardingCompleted: boolean;

  @ApiProperty({ description: 'Current onboarding step' })
  onboardingStep: string;

  @ApiProperty({ description: 'Where to redirect the user' })
  redirectTo: string;
}
