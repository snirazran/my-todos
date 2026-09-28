'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { sendSignInLinkToEmail, signOut, type AuthCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { clearSessionCookie, establishSessionCookie } from '@/lib/authCookie';
import {
  GoogleAccountExistsError,
  getGoogleAuthErrorMessage,
  initNativeGoogleSignIn,
  signInWithExistingGoogle,
  signInWithGoogle,
  signOutNativeGoogle,
} from '@/lib/googleAuth';
import {
  AppleAccountExistsError,
  getAppleAuthErrorMessage,
  initNativeAppleSignIn,
  signInWithApple,
  signInWithExistingApple,
  signOutNativeApple,
} from '@/lib/appleAuth';
import { AccountConflictDialog } from '@/components/auth/AccountConflictDialog';
import {
  createEmailLinkSettings,
  setEmailLinkIntent,
} from '@/lib/emailLinkSettings';
import { describeSignInMethod, lookupAccountByEmail } from '@/lib/accountLookup';
import { clearOnboardingDraft } from '@/lib/onboardingDraft';
import { Input } from '@/components/ui/input';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, useOnboardingKeyboardInset } from './OnboardingFooter';

type Step = 'enter' | 'email-sent';

type ReturningAccount = {
  name: string | null;
  frogName: string | null;
};

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

const variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function CreateAccountStep({ selections, onNext, saving }: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const [step, setStep] = useState<Step>('enter');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{
    credential: AuthCredential | null;
    provider: 'google' | 'apple';
  } | null>(null);
  const [existingEmail, setExistingEmail] = useState<{
    email: string;
    method: string | null;
  } | null>(null);
  const [returning, setReturning] = useState<ReturningAccount | null>(null);
  const [sentIntent, setSentIntent] = useState<'new-account' | 'existing-account'>(
    'new-account',
  );
  const [switching, setSwitching] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const keyboardInset = useOnboardingKeyboardInset();

  useEffect(() => {
    const form = formRef.current;
    const vv = window.visualViewport;
    if (!keyboardInset || !form || !vv) return;
    const scroller = form.closest('main');
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      const visibleBottom = vv.offsetTop + vv.height - 12;
      const overlap = form.getBoundingClientRect().bottom - visibleBottom;
      if (overlap > 0) scroller.scrollBy({ top: overlap, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardInset, error]);

  useEffect(() => {
    void initNativeGoogleSignIn().catch(() => {
      // The button action retries initialization and surfaces a friendly error.
    });
    void initNativeAppleSignIn().catch(() => {
      // Same here — the button retries and reports its own error.
    });
  }, []);

  const syncUser = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign-in did not complete');
    await establishSessionCookie(user);
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    return (await res.json().catch(() => ({}))) as {
      isNewUser?: boolean;
      alreadyOnboarded?: boolean;
      name?: string | null;
      frogName?: string | null;
    };
  };

  // Signing in landed on an account that already exists and already has a frog.
  // Onboarding must stop here: continuing would overwrite that account's name
  // and frog name with the answers drafted in this session.
  const showReturning = (data: {
    name?: string | null;
    frogName?: string | null;
  }) => {
    clearOnboardingDraft();
    setReturning({ name: data.name ?? null, frogName: data.frogName ?? null });
    setConflict(null);
    setExistingEmail(null);
    setLoading(false);
    setSwitching(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = auth.currentUser;
      await signInWithGoogle({ linkTo: current?.isAnonymous ? current : null });
      const data = await syncUser();
      if (data.alreadyOnboarded) {
        showReturning(data);
        return;
      }
      onNext();
    } catch (signInError: any) {
      if (signInError instanceof GoogleAccountExistsError) {
        setConflict({ credential: signInError.credential, provider: 'google' });
      } else {
        setError(getGoogleAuthErrorMessage(signInError));
      }
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = auth.currentUser;
      await signInWithApple({ linkTo: current?.isAnonymous ? current : null });
      const data = await syncUser();
      if (data.alreadyOnboarded) {
        showReturning(data);
        return;
      }
      onNext();
    } catch (signInError: any) {
      if (signInError instanceof AppleAccountExistsError) {
        setConflict({ credential: signInError.credential, provider: 'apple' });
      } else {
        setError(getAppleAuthErrorMessage(signInError));
      }
      setLoading(false);
    }
  };

  const handleSwitchToExisting = async () => {
    if (!conflict || switching) return;
    const isApple = conflict.provider === 'apple';
    setSwitching(true);
    try {
      if (isApple) {
        await signInWithExistingApple(conflict.credential);
      } else {
        await signInWithExistingGoogle(conflict.credential);
      }
      const data = await syncUser();
      if (data.alreadyOnboarded) {
        showReturning(data);
        return;
      }
      setConflict(null);
      setSwitching(false);
      onNext();
    } catch (switchError: any) {
      setConflict(null);
      setError(
        conflict.provider === 'apple'
          ? getAppleAuthErrorMessage(switchError)
          : getGoogleAuthErrorMessage(switchError),
      );
      setSwitching(false);
    }
  };

  const sendEmailLink = async (address: string, intent: 'new-account' | 'existing-account') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    await sendSignInLinkToEmail(
      auth,
      address,
      createEmailLinkSettings(`${origin}/auth/email-callback`),
    );
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, address);
    setEmailLinkIntent(intent);
    setSentIntent(intent);
    setStep('email-sent');
  };

  const handleSendEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      // Firebase removed client-side sign-in-method lookup (email enumeration
      // protection), so ask the server before sending the link — otherwise the
      // link silently signs into the existing account with no warning at all.
      const lookup = await lookupAccountByEmail(trimmed);
      if (lookup.exists) {
        setExistingEmail({
          email: trimmed,
          method: describeSignInMethod(lookup.providers),
        });
        setLoading(false);
        return;
      }
      await sendEmailLink(trimmed, 'new-account');
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send email link');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmExistingEmail = async () => {
    if (!existingEmail || switching) return;
    setSwitching(true);
    try {
      await sendEmailLink(existingEmail.email, 'existing-account');
      setExistingEmail(null);
    } catch (sendError: unknown) {
      setError(
        sendError instanceof Error ? sendError.message : 'Could not send email link',
      );
      setExistingEmail(null);
    } finally {
      setSwitching(false);
    }
  };

  const handleUseAnotherAccount = async () => {
    setSwitching(true);
    await Promise.allSettled([
      auth ? signOut(auth) : Promise.resolve(),
      clearSessionCookie(),
      signOutNativeGoogle(),
      signOutNativeApple(),
    ]);
    setReturning(null);
    setSwitching(false);
    setStep('enter');
  };

  const returningFrogName = returning?.frogName?.trim() || 'your frog';

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <OnboardingFrogHeader
        title={`Don't lose ${frogName}!`}
        subtitle="Create a free account so your frog and progress are safe on any device."
      />

      <div className={`relative z-20 flex w-full flex-col items-center px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:pb-10 ${ONBOARDING_BODY_CLASS}`}>
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {step === 'enter' ? (
              <motion.div
                key="email"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
              >
                <div className="flex flex-col gap-3">
                  <OnboardingButton
                    variant="secondary"
                    onClick={handleGoogle}
                    loading={loading}
                    className="h-[52px] text-foreground md:w-full"
                  >
                    <GoogleIcon /> Continue with Google
                  </OnboardingButton>
                  <OnboardingButton
                    variant="secondary"
                    onClick={handleApple}
                    loading={loading}
                    className="h-[52px] text-foreground md:w-full"
                  >
                    <AppleIcon /> Continue with Apple
                  </OnboardingButton>
                </div>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-[13px]">
                    <span className="bg-background px-3 font-bold text-muted-foreground">
                      or use email
                    </span>
                  </div>
                </div>

                <form ref={formRef} onSubmit={handleSendEmailLink} className="space-y-3">
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    enterKeyHint="send"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    name="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-[52px] rounded-2xl border-2 border-border/60 bg-card text-center text-base font-bold shadow-[0_3px_0_0_rgba(0,0,0,0.06)] placeholder:font-semibold placeholder:text-muted-foreground/50 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:ring-offset-0 md:text-base"
                    required
                  />
                  {error ? <ErrorMsg>{error}</ErrorMsg> : null}
                  <OnboardingButton
                    type="submit"
                    disabled={!email.trim()}
                    loading={loading}
                    className="md:w-full"
                  >
                    Send sign-in link
                  </OnboardingButton>
                </form>
                {keyboardInset > 0 ? (
                  <div aria-hidden style={{ height: keyboardInset }} />
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                key="email-sent"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center text-center"
              >
                <div className="flex w-full flex-col items-center rounded-3xl border border-border/60 bg-card px-5 py-5 shadow-[0_3px_0_0_rgba(0,0,0,0.06)]">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <MailCheck className="h-6 w-6" strokeWidth={2.25} />
                  </span>
                  <p className="mt-3 text-base font-black text-foreground">Check your inbox</p>
                  <p className="mt-1 break-all text-sm font-bold text-primary">{email}</p>
                  <p className="mt-2 text-[13px] font-medium leading-snug text-muted-foreground">
                    {sentIntent === 'existing-account'
                      ? 'Tap the link to sign back into your account. Your frog and progress will be exactly as you left them.'
                      : 'Tap the link to finish signing in. You can hop in meanwhile.'}
                  </p>
                </div>
                {sentIntent === 'new-account' ? (
                  <OnboardingButton onClick={onNext} loading={saving} className="mt-5 md:w-full">
                    Hop in
                  </OnboardingButton>
                ) : null}
                <OnboardingButton
                  variant="ghost"
                  onClick={() => setStep('enter')}
                  disabled={saving}
                  className="mt-1 md:w-full"
                >
                  Use a different email
                </OnboardingButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AccountConflictDialog
        open={!!existingEmail}
        busy={switching}
        title="You already have a frog!"
        message={
          <>
            <span className="font-bold text-foreground">{existingEmail?.email}</span>{' '}
            already has a Frogress account
            {existingEmail?.method ? ` you set up with ${existingEmail.method}` : ''}.
            We&apos;ll send a link to sign back into it — {frogName} from this
            session won&apos;t be saved.
          </>
        }
        confirmLabel="Sign in to my account"
        cancelLabel="Use a different email"
        onConfirm={handleConfirmExistingEmail}
        onCancel={() => setExistingEmail(null)}
      />

      <AccountConflictDialog
        open={!!conflict}
        busy={switching}
        title="You already have a frog!"
        message={`That ${conflict?.provider === 'apple' ? 'Apple' : 'Google'} account is already connected to a Frogress account. Switch to it? Your progress from this session will be left behind.`}
        confirmLabel="Switch to my account"
        onConfirm={handleSwitchToExisting}
        onCancel={() => setConflict(null)}
      />

      <AccountConflictDialog
        open={!!returning}
        busy={switching}
        title={returning?.name ? `Welcome back, ${returning.name}!` : 'Welcome back!'}
        message={`${returningFrogName} is right where you left them — nothing was renamed or reset. The frog you just set up here wasn't saved.`}
        confirmLabel={`Go to ${returningFrogName}`}
        cancelLabel="Use a different account"
        dismissOnBackdrop={false}
        onConfirm={() => window.location.replace('/')}
        onCancel={handleUseAnotherAccount}
      />
    </div>
  );
}

function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-[13px] font-black text-destructive">
      {children}
    </p>
  );
}
