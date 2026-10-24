'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { Check, Loader2, Mail, MailCheck } from 'lucide-react';
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
import { hapticSuccess } from '@/lib/haptics';
import { findStarterSkin } from '@/lib/skins/starterSkins';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

type Step = 'enter' | 'email-sent';

type ReturningAccount = {
  name: string | null;
  frogName: string | null;
};

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

const SAVED_HOLD_MS = 650;
const CARD_FULL_PX = 80;
const CARD_COMPACT_PX = 64;

type CardSize = 'full' | 'compact' | 'none';

const LEGAL_LINK_CLASS =
  'font-semibold text-foreground/80 underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/70';

const variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function CreateAccountStep({ selections, onNext, saving }: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0]?.trim() || null;
  const skin = findStarterSkin(selections.frogSkin?.[0]);
  const [saved, setSaved] = useState(false);
  const [skipAsk, setSkipAsk] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<CardSize>('none');
  const [step, setStep] = useState<Step>('enter');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'google' | 'apple' | 'email' | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [appleFirst, setAppleFirst] = useState(false);
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

  useEffect(() => {
    setAppleFirst(Capacitor.getPlatform() === 'ios');
  }, []);

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
    setPending(null);
    setSwitching(false);
  };

  const finishSaved = () => {
    setSaved(true);
    hapticSuccess();
    window.setTimeout(onNext, SAVED_HOLD_MS);
  };

  const handleGoogle = async () => {
    setPending('google');
    setError(null);
    try {
      const current = auth.currentUser;
      await signInWithGoogle({ linkTo: current?.isAnonymous ? current : null });
      const data = await syncUser();
      if (data.alreadyOnboarded) {
        showReturning(data);
        return;
      }
      finishSaved();
    } catch (signInError: any) {
      if (signInError instanceof GoogleAccountExistsError) {
        setConflict({ credential: signInError.credential, provider: 'google' });
      } else {
        setError(getGoogleAuthErrorMessage(signInError));
      }
      setPending(null);
    }
  };

  const handleApple = async () => {
    setPending('apple');
    setError(null);
    try {
      const current = auth.currentUser;
      await signInWithApple({ linkTo: current?.isAnonymous ? current : null });
      const data = await syncUser();
      if (data.alreadyOnboarded) {
        showReturning(data);
        return;
      }
      finishSaved();
    } catch (signInError: any) {
      if (signInError instanceof AppleAccountExistsError) {
        setConflict({ credential: signInError.credential, provider: 'apple' });
      } else {
        setError(getAppleAuthErrorMessage(signInError));
      }
      setPending(null);
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
      finishSaved();
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

    setPending('email');
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
        setPending(null);
        return;
      }
      await sendEmailLink(trimmed, 'new-account');
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send email link');
    } finally {
      setPending(null);
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

  const busy = pending !== null || saving || saved;

  const google = (primary: boolean) => (
    <ProviderButton
      key="google"
      primary={primary}
      onClick={handleGoogle}
      disabled={busy}
      loading={pending === 'google'}
    >
      <GoogleIcon className="h-[18px] w-[18px] shrink-0" /> Continue with Google
    </ProviderButton>
  );
  const apple = (primary: boolean) => (
    <ProviderButton
      key="apple"
      primary={primary}
      onClick={handleApple}
      disabled={busy}
      loading={pending === 'apple'}
    >
      <AppleIcon className="h-[18px] w-[18px] shrink-0" /> Continue with Apple
    </ProviderButton>
  );
  const providerButtons = appleFirst ? [apple(true), google(false)] : [google(true), apple(false)];

  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const measure = () => {
      const height = room.clientHeight;
      setCardSize(
        height >= CARD_FULL_PX ? 'full' : height >= CARD_COMPACT_PX ? 'compact' : 'none',
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [step]);

  const swap = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <div className="relative flex w-full flex-1 flex-col">
      {step === 'enter' && !emailOpen ? (
        <button
          type="button"
          onClick={() => setSkipAsk(true)}
          disabled={busy}
          className="absolute right-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex h-10 items-center rounded-full bg-background/90 px-4 text-[14px] font-black text-muted-foreground shadow-md ring-1 ring-border/40 backdrop-blur transition animate-in fade-in duration-300 hover:bg-background disabled:opacity-60"
        >
          Skip
        </button>
      ) : null}
      <OnboardingFrogHeader
        title={step === 'enter' ? `Don't lose ${frogName}!` : 'Check your inbox'}
        subtitle={
          step === 'enter'
            ? 'Save your progress with a free account.'
            : sentIntent === 'existing-account'
              ? 'Tap the link to sign back into your account.'
              : 'Tap the link to finish. You can keep going meanwhile.'
        }
      />

      <div className={cn('relative z-20 flex w-full flex-1 flex-col items-center', ONBOARDING_BODY_CLASS)}>
        {step === 'enter' ? (
          <div ref={roomRef} className="relative w-full flex-1 md:w-80">
            {cardSize !== 'none' ? (
              <div className="absolute inset-0 flex items-center">
                <SaveCard
                  frogName={frogName}
                  humanName={humanName}
                  skin={skin}
                  saved={saved}
                  compact={cardSize === 'compact'}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {step === 'email-sent' ? (
          <motion.div
            {...swap}
            className="mt-5 flex w-full max-w-sm items-center gap-3.5 rounded-[20px] border-2 border-border/60 bg-card px-4 py-3.5 shadow-[0_3px_0_0_rgba(0,0,0,0.06)]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-[22px] w-[22px]" strokeWidth={2.25} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-muted-foreground">
                Link sent to
              </span>
              <span className="block truncate text-[15px] font-bold text-foreground">
                {email.trim()}
              </span>
            </span>
          </motion.div>
        ) : null}
      </div>


      <OnboardingFooter
        className={
          step === 'enter' && !emailOpen
            ? 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
            : undefined
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 'enter' && !emailOpen ? (
            <motion.div key="providers" {...swap} className="flex w-full flex-col gap-2 md:w-80">
              {providerButtons}
              <ProviderButton
                onClick={() => {
                  setError(null);
                  setEmailOpen(true);
                }}
                disabled={busy}
              >
                <Mail className="h-[18px] w-[18px]" strokeWidth={2.5} /> Continue with email
              </ProviderButton>
            </motion.div>
          ) : step === 'enter' ? (
            <motion.form
              key="email"
              {...swap}
              onSubmit={handleSendEmailLink}
              className="flex w-full flex-col gap-2.5 md:w-80"
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="send"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                placeholder="you@example.com"
                aria-label="Email address"
                name="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError(null);
                }}
                className="h-[52px] rounded-2xl border-2 border-border/60 bg-card px-4 text-base font-bold shadow-[0_3px_0_0_rgba(0,0,0,0.06)] placeholder:font-semibold placeholder:text-muted-foreground/50 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:ring-offset-0 md:text-base"
                required
              />
              <OnboardingButton
                type="submit"
                disabled={!email.trim() || busy}
                loading={pending === 'email'}
              >
                Send sign-in link
              </OnboardingButton>
            </motion.form>
          ) : sentIntent === 'new-account' ? (
            <motion.div key="sent" {...swap} className="flex w-full justify-center">
              <OnboardingButton onClick={onNext} loading={saving}>
                Continue
              </OnboardingButton>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? <ErrorMsg>{error}</ErrorMsg> : null}

        {step === 'enter' ? (
          <p className="mt-0.5 max-w-[23rem] text-balance text-center text-[11px] leading-snug text-muted-foreground">
            By continuing, you agree to our{' '}
            <Link href="/terms" className={LEGAL_LINK_CLASS}>
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className={LEGAL_LINK_CLASS}>
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}

        {step === 'enter' ? (
          emailOpen ? (
            <OnboardingButton
              variant="ghost"
              onClick={() => {
                setEmailOpen(false);
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </OnboardingButton>
          ) : null
        ) : (
          <OnboardingButton variant="ghost" onClick={() => setStep('enter')} disabled={saving}>
            Use a different email
          </OnboardingButton>
        )}
      </OnboardingFooter>

      <AccountConflictDialog
        open={skipAsk}
        title={`Skip saving ${frogName}?`}
        message={`Without an account, ${frogName} only lives on this device. Delete the app or switch phones and ${frogName} is gone.`}
        confirmLabel={`Save ${frogName}`}
        cancelLabel="Skip anyway"
        dismissOnBackdrop={false}
        onConfirm={() => {
          setSkipAsk(false);
          void (appleFirst ? handleApple() : handleGoogle());
        }}
        onCancel={() => {
          setSkipAsk(false);
          onNext();
        }}
      />

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

function SaveCard({
  frogName,
  humanName,
  skin,
  saved,
  compact,
}: {
  frogName: string;
  humanName: string | null;
  skin: ReturnType<typeof findStarterSkin>;
  saved: boolean;
  compact: boolean;
}) {
  const owner = humanName ? `${humanName}’s` : 'Your';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="w-full overflow-hidden rounded-[22px] border-2 border-border/60 bg-card shadow-[0_3px_0_0_rgba(0,0,0,0.05)]"
    >
      <div className={cn('flex items-center gap-3 px-3.5', compact ? 'py-2' : 'py-3')}>
        <span
          aria-hidden
          className={cn(
            'flex shrink-0 items-end justify-center overflow-hidden rounded-2xl',
            compact ? 'h-11 w-11' : 'h-[52px] w-[52px]',
          )}
          style={{ backgroundColor: `${skin.color}38` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={skin.image} alt="" className="w-[86%] translate-y-[8%]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-black leading-tight text-foreground">
            {frogName}
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-muted-foreground">
            {owner} {skin.label.toLowerCase()} frog
          </span>
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={saved ? 'saved' : 'unsaved'}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black',
              saved
                ? 'bg-primary text-primary-foreground'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
            )}
          >
            {saved ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
            ) : (
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-amber-500 motion-safe:animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-amber-500" />
              </span>
            )}
            {saved ? 'Saved' : 'Not saved'}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ProviderButton({
  children,
  onClick,
  disabled,
  loading,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[50px] w-full items-center justify-center gap-2.5 rounded-2xl text-[15px] font-black transition-[transform,box-shadow,opacity] [-webkit-tap-highlight-color:transparent] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60',
        primary
          ? 'bg-foreground text-background shadow-[0_3px_0_0_rgba(0,0,0,0.35)] dark:shadow-[0_3px_0_0_rgba(255,255,255,0.25)]'
          : 'bg-card text-foreground shadow-[0_3px_0_0_hsl(var(--border))] ring-1 ring-border',
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <p className="w-full rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-[13px] font-black text-destructive">
      {children}
    </p>
  );
}
