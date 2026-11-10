import { auth } from '@/lib/firebase';
import { establishSessionCookie } from '@/lib/authCookie';
import {
  GoogleAccountExistsError,
  getGoogleAuthErrorMessage,
  signInWithGoogle,
} from '@/lib/googleAuth';
import {
  AppleAccountExistsError,
  getAppleAuthErrorMessage,
  signInWithApple,
} from '@/lib/appleAuth';

export type GuestLinkProvider = 'google' | 'apple';

export const GUEST_UPGRADE_PATH = '/login?upgrade=1';

export async function linkGuestAccountWith(provider: GuestLinkProvider) {
  const current = auth?.currentUser;
  if (!current) throw new Error('No signed-in guest to link');
  if (provider === 'google') {
    await signInWithGoogle({ linkTo: current });
  } else {
    await signInWithApple({ linkTo: current });
  }
  const user = auth?.currentUser;
  if (!user) throw new Error('Authentication did not complete');
  await user.getIdToken(true);
  await establishSessionCookie(user);
  await fetch('/api/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

export function isExistingAccountError(err: unknown) {
  return err instanceof GoogleAccountExistsError || err instanceof AppleAccountExistsError;
}

export function guestLinkErrorMessage(provider: GuestLinkProvider, err: unknown) {
  return provider === 'google' ? getGoogleAuthErrorMessage(err) : getAppleAuthErrorMessage(err);
}
