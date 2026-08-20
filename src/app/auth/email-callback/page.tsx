'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  EmailAuthProvider,
  linkWithCredential,
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { auth } from '@/lib/firebase';
import { establishSessionCookie } from '@/lib/authCookie';
import { takeEmailLinkIntent } from '@/lib/emailLinkSettings';
import { clearOnboardingDraft } from '@/lib/onboardingDraft';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';
const POST_LOGIN_ROUTE_KEY = 'frogress.post-login-route';

type Returning = { name: string | null; frogName: string | null };

export default function EmailCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [needEmail, setNeedEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [conflictEmail, setConflictEmail] = useState<string | null>(null);
  const [returning, setReturning] = useState<Returning | null>(null);
  const [switching, setSwitching] = useState(false);
  const ranRef = useRef(false);
  const intentRef = useRef<ReturnType<typeof takeEmailLinkIntent>>(null);

  const finishSignedIn = async () => {
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    const user = auth.currentUser;
    if (!user) throw new Error('No user after sign-in');
    await establishSessionCookie(user);
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const storedRoute = window.localStorage.getItem(POST_LOGIN_ROUTE_KEY);
    window.localStorage.removeItem(POST_LOGIN_ROUTE_KEY);
    const safeRoute =
      storedRoute?.startsWith('/') && !storedRoute.startsWith('//') ? storedRoute : '/';

    // The link resolved onto an account that already has a frog. Drop the draft
    // answers from this session and say so, instead of dropping the user into a
    // flow that would rename that account.
    if (data?.alreadyOnboarded) {
      clearOnboardingDraft();
      setReturning({
        name: data?.name ?? null,
        frogName: data?.frogName ?? null,
      });
      setSwitching(false);
      return;
    }

    router.replace(data?.isNewUser ? '/onboarding' : safeRoute);
  };

  const complete = async (emailForLink: string) => {
    setError(null);
    try {
      const href = window.location.href;
      if (!isSignInWithEmailLink(auth, href)) {
        setError('This link is invalid or has expired.');
        return;
      }

      const current = auth.currentUser;
      // When the user already confirmed they're signing back into an existing
      // account, don't try to graft this session's guest progress onto it.
      const wantsExisting = intentRef.current === 'existing-account';

      if (current && current.isAnonymous && !wantsExisting) {
        // Link the email credential to the existing anonymous user so progress carries over.
        const cred = EmailAuthProvider.credentialWithLink(emailForLink, href);
        try {
          await linkWithCredential(current, cred);
        } catch (linkErr: any) {
          if (
            linkErr?.code === 'auth/credential-already-in-use' ||
            linkErr?.code === 'auth/email-already-in-use'
          ) {
            setConflictEmail(emailForLink);
            return;
          }
          throw linkErr;
        }
      } else {
        await signInWithEmailLink(auth, emailForLink, href);
      }

      await finishSignedIn();
    } catch (err: any) {
      const map: Record<string, string> = {
        'auth/invalid-action-code':
          'This link has already been used or expired.',
        'auth/credential-already-in-use':
          'That email is linked to another account.',
        'auth/email-already-in-use':
          'That email is linked to another account.',
      };
      setError(map[err?.code ?? ''] ?? err?.message ?? 'Sign-in failed');
    }
  };

  const switchToExisting = async () => {
    if (!conflictEmail || switching) return;
    setSwitching(true);
    clearOnboardingDraft();
    try {
      await signInWithEmailLink(auth, conflictEmail, window.location.href);
      setConflictEmail(null);
      await finishSignedIn();
    } catch (err: any) {
      setConflictEmail(null);
      setSwitching(false);
      setError(
        err?.code === 'auth/invalid-action-code'
          ? 'This link has expired — request a new one from the login page.'
          : err?.message ?? 'Sign-in failed',
      );
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    intentRef.current = takeEmailLinkIntent();
    const stored = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
    if (stored) {
      void complete(stored);
    } else {
      setNeedEmail(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returningFrogName = returning?.frogName?.trim() || 'Your frog';

  return (
    <main className="fixed inset-0 flex items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-center max-w-sm w-full">
        <div className="pointer-events-none">
          <Frog
            width={160}
            height={160}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>

        {returning ? (
          <>
            <h1 className="mt-2 text-2xl font-black text-center text-foreground">
              {returning.name ? `Welcome back, ${returning.name}!` : 'Welcome back!'}
            </h1>
            <p className="mt-3 text-sm text-center text-muted-foreground">
              {returningFrogName} is right where you left them — nothing was
              renamed or reset.
            </p>
            <button
              onClick={() => window.location.replace('/')}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm"
            >
              Continue
            </button>
          </>
        ) : conflictEmail ? (
          <>
            <h1 className="mt-2 text-2xl font-black text-center text-foreground">
              You already have a frog!
            </h1>
            <p className="mt-3 text-sm text-center text-muted-foreground">
              <span className="font-bold text-foreground">{conflictEmail}</span>{' '}
              is already connected to a Frogress account. Sign in to it? Your
              guest progress on this device will be left behind.
            </p>
            <button
              onClick={switchToExisting}
              disabled={switching}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm disabled:opacity-60"
            >
              {switching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Sign in to my account'
              )}
            </button>
            <button
              onClick={() => router.replace('/')}
              disabled={switching}
              className="mt-3 h-11 w-full text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              Keep playing as guest
            </button>
          </>
        ) : error ? (
          <>
            <h1 className="mt-2 text-2xl font-black text-center text-foreground">
              Couldn&apos;t sign you in
            </h1>
            <p className="mt-3 text-sm text-center text-destructive">{error}</p>
            <button
              onClick={() => router.replace('/login')}
              className="mt-6 px-6 h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm"
            >
              Back to login
            </button>
          </>
        ) : needEmail ? (
          <>
            <h1 className="mt-2 text-2xl font-black text-center text-foreground">
              Confirm your email
            </h1>
            <p className="mt-3 text-sm text-center text-muted-foreground">
              Looks like you opened this link on a different device. Enter the
              email you used to receive the link.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (emailInput.trim()) void complete(emailInput.trim());
              }}
              className="w-full mt-5 space-y-3"
            >
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email"
                className="w-full h-12 px-4 rounded-xl border border-border/60 bg-background/50"
              />
              <button
                type="submit"
                className="flex items-center justify-center w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm"
              >
                Continue
              </button>
            </form>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 mt-4 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              Signing you in...
            </p>
          </>
        )}
      </div>
    </main>
  );
}
