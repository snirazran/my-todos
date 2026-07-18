import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export class GoogleAccountExistsError extends Error {
  credential: AuthCredential | null;

  constructor(credential: AuthCredential | null) {
    super('That Google account is already linked to another user.');
    this.name = 'GoogleAccountExistsError';
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

const WEB_CLIENT_ID =
  '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com';
const IOS_CLIENT_ID =
  '324868480648-qv2h2spg5jl3mmhek4u6vvefm7k7m0f4.apps.googleusercontent.com';

let nativeGoogleInitPromise: Promise<void> | null = null;

// The plugin rejects with a USER_CANCELLED code on both platforms, so no
// cancel-fallback timer is needed. A JS-side timeout here is actively harmful:
// the post-logout sign-in runs a consent + token-exchange step after the
// account sheet closes, and a timer racing that flow discards real logins as
// "cancelled" (the login succeeds on Google's side, which is why a retry then
// signs in instantly).
async function openNativeGoogleSignIn() {
  return SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
}

export function initNativeGoogleSignIn(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();

  if (!nativeGoogleInitPromise) {
    nativeGoogleInitPromise = SocialLogin.initialize({
      google: {
        webClientId: WEB_CLIENT_ID,
        iOSClientId: IOS_CLIENT_ID,
        iOSServerClientId: WEB_CLIENT_ID,
        mode: 'online',
      },
    }).catch((error) => {
      // Allow a later attempt to retry if native initialization failed.
      nativeGoogleInitPromise = null;
      throw error;
    });
  }

  return nativeGoogleInitPromise;
}

export async function signInWithGoogle({
  linkTo,
}: { linkTo?: User | null } = {}) {
  if (Capacitor.isNativePlatform()) {
    await initNativeGoogleSignIn();
    const googleUser = await openNativeGoogleSignIn();
    const idToken =
      googleUser.result.responseType === 'online'
        ? googleUser.result.idToken
        : null;
    if (!idToken) throw new Error('Failed to get Google token');
    const cred = GoogleAuthProvider.credential(idToken);
    if (linkTo) {
      try {
        await linkWithCredential(linkTo, cred);
      } catch (error) {
        if (isCredentialInUse(error)) {
          throw new GoogleAccountExistsError(cred);
        }
        throw error;
      }
    } else {
      await signInWithCredential(auth, cred);
    }
  } else {
    const provider = new GoogleAuthProvider();
    if (linkTo) {
      try {
        await linkWithPopup(linkTo, provider);
      } catch (error) {
        if (isCredentialInUse(error)) {
          throw new GoogleAccountExistsError(
            GoogleAuthProvider.credentialFromError(error as any),
          );
        }
        throw error;
      }
    } else {
      await signInWithPopup(auth, provider);
    }
  }
}

export async function signInWithExistingGoogle(
  credential: AuthCredential | null,
) {
  if (credential) {
    await signInWithCredential(auth, credential);
  } else {
    await signInWithGoogle();
  }
}

export async function signOutNativeGoogle(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await initNativeGoogleSignIn();
  await SocialLogin.logout({ provider: 'google' });
}

const GOOGLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'An account already uses this email with a different sign-in method.',
  'auth/credential-already-in-use':
    'That Google account is already linked to another user.',
  'auth/email-already-in-use':
    'That email is already linked to another account.',
  'auth/network-request-failed':
    'Could not reach Google. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Google sign-in is temporarily unavailable. Please try again later.',
  'auth/popup-blocked':
    'Your browser blocked the Google window. Allow pop-ups and try again.',
  'auth/popup-closed-by-user':
    'Google sign-in was cancelled. No changes were made.',
  'auth/cancelled-popup-request':
    'Another Google sign-in window is already open.',
  'auth/too-many-requests':
    'Too many sign-in attempts. Wait a moment and try again.',
  'auth/unauthorized-domain':
    'Google sign-in is not configured for this address.',
  'auth/user-disabled':
    'This account has been disabled. Please contact support.',
};

export function getGoogleAuthErrorMessage(error: unknown): string {
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

  if (GOOGLE_AUTH_ERROR_MESSAGES[code]) {
    return GOOGLE_AUTH_ERROR_MESSAGES[code];
  }

  // Native Google SDKs don't consistently expose Firebase-style error codes,
  // so normalize their cancellation/network messages as well.
  const normalized = `${code} ${message}`.toLowerCase();
  if (
    normalized.includes('cancel') ||
    normalized.includes('popup_closed') ||
    normalized.includes('12501')
  ) {
    return 'Google sign-in was cancelled. No changes were made.';
  }
  if (
    normalized.includes('network') ||
    normalized.includes('offline') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'Could not reach Google. Check your connection and try again.';
  }
  if (
    normalized.includes('already in progress') ||
    normalized.includes('already open')
  ) {
    return 'A Google sign-in is already in progress.';
  }
  if (
    normalized.includes('initialize') ||
    normalized.includes('configuration') ||
    normalized.includes('developer_error') ||
    normalized.includes('10:')
  ) {
    return 'Google sign-in could not start. Please try again in a moment.';
  }

  return 'Google sign-in could not finish. Please try again.';
}
