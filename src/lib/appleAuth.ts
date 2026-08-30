import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  OAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
  updateProfile,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export class AppleAccountExistsError extends Error {
  credential: AuthCredential | null;

  constructor(credential: AuthCredential | null) {
    super('That Apple account is already linked to another user.');
    this.name = 'AppleAccountExistsError';
    this.credential = credential;
  }
}

function isCredentialInUse(error: unknown): boolean {
  const code =
    error && typeof error === 'object'
      ? (error as { code?: unknown }).code
      : null;
  return code === 'auth/credential-already-in-use';
}

let nativeAppleInitPromise: Promise<void> | null = null;

export function initNativeAppleSignIn(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();

  if (!nativeAppleInitPromise) {
    nativeAppleInitPromise = SocialLogin.initialize({
      // An empty redirect URL keeps the whole flow on-device; iOS never
      // bounces through a web callback the way Android does.
      apple: { redirectUrl: '' },
    }).catch((error) => {
      nativeAppleInitPromise = null;
      throw error;
    });
  }

  return nativeAppleInitPromise;
}

function randomNonce(length = 32): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Apple echoes whatever nonce it was handed back into the identity token, so
// the request carries the SHA-256 digest and Firebase gets the raw value to
// hash and compare.
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Apple only sends the name on the very first authorization, so it has to be
// written onto the Firebase user right then or it is gone for good.
async function applyAppleName(
  user: User | null,
  givenName: string | null,
  familyName: string | null,
) {
  if (!user || user.displayName) return;
  const name = [givenName, familyName].filter(Boolean).join(' ').trim();
  if (!name) return;
  try {
    await updateProfile(user, { displayName: name });
  } catch {
    // A missing display name is cosmetic — never fail the sign-in over it.
  }
}

export async function signInWithApple({
  linkTo,
}: { linkTo?: User | null } = {}) {
  if (Capacitor.isNativePlatform()) {
    await initNativeAppleSignIn();
    const rawNonce = randomNonce();
    const result = await SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['name', 'email'], nonce: await sha256(rawNonce) },
    });
    const { idToken, profile } = result.result;
    if (!idToken) throw new Error('Failed to get Apple token');
    const cred = new OAuthProvider('apple.com').credential({
      idToken,
      rawNonce,
    });
    if (linkTo) {
      try {
        await linkWithCredential(linkTo, cred);
      } catch (error) {
        if (isCredentialInUse(error)) {
          throw new AppleAccountExistsError(cred);
        }
        throw error;
      }
    } else {
      await signInWithCredential(auth, cred);
    }
    await applyAppleName(
      auth.currentUser,
      profile?.givenName ?? null,
      profile?.familyName ?? null,
    );
  } else {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    if (linkTo) {
      try {
        await linkWithPopup(linkTo, provider);
      } catch (error) {
        if (isCredentialInUse(error)) {
          throw new AppleAccountExistsError(
            OAuthProvider.credentialFromError(error as any),
          );
        }
        throw error;
      }
    } else {
      await signInWithPopup(auth, provider);
    }
  }
}

export async function signInWithExistingApple(
  credential: AuthCredential | null,
) {
  if (credential) {
    await signInWithCredential(auth, credential);
  } else {
    await signInWithApple();
  }
}

export async function signOutNativeApple(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await initNativeAppleSignIn();
    await SocialLogin.logout({ provider: 'apple' });
  } catch {
    // Apple has no real session to end on-device; a failure here is harmless.
  }
}

const APPLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'An account already uses this email with a different sign-in method.',
  'auth/credential-already-in-use':
    'That Apple account is already linked to another user.',
  'auth/email-already-in-use':
    'That email is already linked to another account.',
  'auth/network-request-failed':
    'Could not reach Apple. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Apple sign-in is temporarily unavailable. Please try again later.',
  'auth/popup-blocked':
    'Your browser blocked the Apple window. Allow pop-ups and try again.',
  'auth/popup-closed-by-user':
    'Apple sign-in was cancelled. No changes were made.',
  'auth/cancelled-popup-request': 'Another Apple sign-in window is already open.',
  'auth/too-many-requests':
    'Too many sign-in attempts. Wait a moment and try again.',
  'auth/unauthorized-domain':
    'Apple sign-in is not configured for this address.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
};

export function getAppleAuthErrorMessage(error: unknown): string {
  const details =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof details?.code === 'string' ? details.code : '';
  const message =
    typeof details?.message === 'string'
      ? details.message
      : typeof error === 'string'
        ? error
        : '';

  if (APPLE_AUTH_ERROR_MESSAGES[code]) {
    return APPLE_AUTH_ERROR_MESSAGES[code];
  }

  // ASAuthorizationError codes come back as plain numbers in the message, so
  // normalize the native strings the same way the Google helper does.
  const normalized = `${code} ${message}`.toLowerCase();
  if (
    normalized.includes('cancel') ||
    normalized.includes('1001') ||
    normalized.includes('popup_closed')
  ) {
    return 'Apple sign-in was cancelled. No changes were made.';
  }
  if (
    normalized.includes('network') ||
    normalized.includes('offline') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'Could not reach Apple. Check your connection and try again.';
  }
  if (
    normalized.includes('not available') ||
    normalized.includes('alamofire') ||
    normalized.includes('initialize') ||
    normalized.includes('configuration')
  ) {
    return 'Apple sign-in could not start. Please try again in a moment.';
  }

  return 'Apple sign-in could not finish. Please try again.';
}
