import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const WEB_CLIENT_ID =
  '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com';
const IOS_CLIENT_ID =
  '324868480648-qv2h2spg5jl3mmhek4u6vvefm7k7m0f4.apps.googleusercontent.com';

export function initNativeGoogleSignIn() {
  if (!Capacitor.isNativePlatform()) return;
  void SocialLogin.initialize({
    google: {
      webClientId: WEB_CLIENT_ID,
      iOSClientId: IOS_CLIENT_ID,
      iOSServerClientId: WEB_CLIENT_ID,
      mode: 'online',
    },
  });
}

export async function signInWithGoogle({
  linkTo,
}: { linkTo?: User | null } = {}) {
  if (Capacitor.isNativePlatform()) {
    const googleUser = await SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] },
    });
    const idToken =
      googleUser.result.responseType === 'online'
        ? googleUser.result.idToken
        : null;
    if (!idToken) throw new Error('Failed to get Google token');
    const cred = GoogleAuthProvider.credential(idToken);
    if (linkTo) {
      await linkWithCredential(linkTo, cred);
    } else {
      await signInWithCredential(auth, cred);
    }
  } else {
    const provider = new GoogleAuthProvider();
    if (linkTo) {
      await linkWithPopup(linkTo, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  }
}

export const GOOGLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/credential-already-in-use':
    'That Google account is already linked to another user.',
  'auth/email-already-in-use':
    'That email is already linked to another account.',
};
