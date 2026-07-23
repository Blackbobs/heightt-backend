export class AuthResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  verificationStatus: string;
  accessToken: string;
  refreshToken: string;
}
