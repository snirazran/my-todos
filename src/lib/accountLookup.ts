export type AccountLookup = {
  exists: boolean;
  providers: string[];
  unavailable: boolean;
};

const NO_ACCOUNT: AccountLookup = {
  exists: false,
  providers: [],
  unavailable: true,
};

export async function lookupAccountByEmail(
  email: string,
): Promise<AccountLookup> {
  try {
    const res = await fetch('/api/auth/lookup-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return NO_ACCOUNT;
    const data = await res.json().catch(() => null);
    if (!data) return NO_ACCOUNT;
    return {
      exists: !!data.exists,
      providers: Array.isArray(data.providers)
        ? data.providers.filter((id: unknown): id is string => typeof id === 'string')
        : [],
      unavailable: !!data.unavailable,
    };
  } catch {
    return NO_ACCOUNT;
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  'google.com': 'Google',
  'apple.com': 'Apple',
  'facebook.com': 'Facebook',
  password: 'an email link',
  phone: 'a phone number',
};

export function describeSignInMethod(providers: string[]): string | null {
  for (const id of providers) {
    const label = PROVIDER_LABELS[id];
    if (label) return label;
  }
  return null;
}
