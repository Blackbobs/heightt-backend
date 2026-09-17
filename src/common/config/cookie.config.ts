export interface CookieSettings {
  secure: boolean;
  sameSite: 'none' | 'lax' | 'strict';
}

export function getCookieSettings(
  env: NodeJS.ProcessEnv = process.env,
): CookieSettings {
  const production = env.NODE_ENV === 'production';
  const secureValue = env.COOKIE_SECURE?.trim().toLowerCase();
  const sameSite =
    env.COOKIE_SAME_SITE?.trim().toLowerCase() || (production ? 'none' : 'lax');

  if (secureValue && !['true', 'false'].includes(secureValue)) {
    throw new Error('COOKIE_SECURE must be true or false');
  }
  const secure = secureValue ? secureValue === 'true' : production;
  if (sameSite !== 'none' && sameSite !== 'lax' && sameSite !== 'strict') {
    throw new Error('COOKIE_SAME_SITE must be none, lax, or strict');
  }
  if (sameSite === 'none' && !secure) {
    throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }
  return { secure, sameSite };
}
