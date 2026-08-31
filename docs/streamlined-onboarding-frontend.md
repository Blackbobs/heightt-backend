# Streamlined onboarding frontend

This guide removes these personal fields from onboarding, profile editing, frontend types, and profile displays:

- `phone`
- `dateOfBirth`
- `state`
- `city`
- `address`
- `bio`

Do not submit, cache, display, or include these fields in analytics. Existing users require no frontend migration because the remaining account and academic fields have not changed.

## Personal information form

The personal-information step should contain:

- First name — required
- Last name — required
- Middle name — optional
- Gender — required
- Country — optional
- Avatar — optional

Create or update the frontend type:

```ts
export type OnboardingPersonalInfo = {
  firstName: string;
  lastName: string;
  middleName?: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  country?: string;
  avatar?: string;
};
```

Submit it to the existing endpoint:

```ts
export async function savePersonalInfo(values: OnboardingPersonalInfo) {
  return apiRequest('/api/v1/onboarding/personal-info', {
    method: 'PATCH',
    body: JSON.stringify({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      ...(values.middleName?.trim()
        ? { middleName: values.middleName.trim() }
        : {}),
      gender: values.gender,
      ...(values.country?.trim() ? { country: values.country.trim() } : {}),
      ...(values.avatar ? { avatar: values.avatar } : {}),
    }),
  });
}
```

`apiRequest` should use the same authenticated, CSRF-aware request helper already used by the app. It must include credentials and `Content-Type: application/json`.

## Complete-onboarding payload

If the frontend uses the combined completion endpoint, use this type:

```ts
export type CompleteOnboardingPayload = {
  firstName?: string;
  lastName?: string;
  studentId?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  country?: string;
  institution?: string;
  faculty?: string;
  department?: string;
  academicLevelId?: string;
  sessionId?: string;
};
```

Example:

```ts
export async function completeOnboarding(
  values: CompleteOnboardingPayload,
) {
  const payload: CompleteOnboardingPayload = {
    ...(values.firstName?.trim()
      ? { firstName: values.firstName.trim() }
      : {}),
    ...(values.lastName?.trim() ? { lastName: values.lastName.trim() } : {}),
    ...(values.studentId?.trim()
      ? { studentId: values.studentId.trim() }
      : {}),
    ...(values.gender ? { gender: values.gender } : {}),
    ...(values.country?.trim() ? { country: values.country.trim() } : {}),
    ...(values.institution ? { institution: values.institution } : {}),
    ...(values.faculty ? { faculty: values.faculty } : {}),
    ...(values.department ? { department: values.department } : {}),
    ...(values.academicLevelId
      ? { academicLevelId: values.academicLevelId }
      : {}),
    ...(values.sessionId ? { sessionId: values.sessionId } : {}),
  };

  return apiRequest('/api/v1/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

## Profile editing

Use this reduced update type for the existing profile endpoint:

```ts
export type UpdateUserProfile = {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  country?: string;
};
```

Remove the retired fields from:

- Form state and validation schemas
- Initial form values
- API payload builders
- React Query, Redux, Zustand, or other cached profile types
- Profile cards and settings pages
- Admin user tables and detail pages
- Search indexes and analytics properties owned by the frontend
- Tests, fixtures, and Storybook stories

## Profile response type

Use this shape for the personal profile returned inside user responses:

```ts
export type UserProfile = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  avatar?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
  country?: string | null;
  onboardingStep: 'PERSONAL_INFO' | 'INSTITUTION' | 'COMPLETED';
  onboardingCompleted: boolean;
  onboardingCompletedAt?: string | null;
  verificationStatus: string;
  verifiedAt?: string | null;
};
```

Do not render fallback labels for removed fields. Delete the entire row or component instead of displaying `N/A`, an empty string, or `undefined`.

## Onboarding status

The personal step now reports these required fields:

```json
{
  "required": ["firstName", "lastName", "gender"]
}
```

Do not hard-code the former required fields. Prefer the `required` and `missing` arrays returned by the onboarding-status endpoint when deciding which step is incomplete.

## Safe rollout order

1. Deploy this backend release. It accepts retired fields from an older frontend but ignores them.
2. Deploy the updated frontend forms and types from this guide.
3. Apply the included database migration in the normal production deployment process.
4. Clear any frontend profile caches after deployment or bump their persisted-cache version.

The temporary compatibility acceptance prevents an older browser tab from failing validation during the rollout. Retired values are not persisted or returned.
