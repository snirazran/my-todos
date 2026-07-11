'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { establishSessionCookie } from '@/lib/authCookie';
import {
  getGoogleAuthErrorMessage,
  initNativeGoogleSignIn,
  signInWithGoogle,
} from '@/lib/googleAuth';
import { createEmailLinkSettings } from '@/lib/emailLinkSettings';
import { Input } from '@/components/ui/input';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';

type Step = 'enter' | 'email-sent';

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

  useEffect(() => {
    void initNativeGoogleSignIn().catch(() => {
      // The button action retries initialization and surfaces a friendly error.
    });
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = auth.currentUser;
      await signInWithGoogle({ linkTo: current?.isAnonymous ? current : null });
      const user = auth.currentUser;
      if (!user) throw new Error('Sign-in did not complete');
      await establishSessionCookie(user);
      await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      onNext();
    } catch (signInError: any) {
      setError(getGoogleAuthErrorMessage(signInError));
      setLoading(false);
    }
  };

  const handleSendEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await sendSignInLinkToEmail(
        auth,
        trimmed,
        createEmailLinkSettings(`${origin}/auth/email-callback`),
      );
      window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, trimmed);
      setStep('email-sent');
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send email link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <OnboardingFrogHeader
        title={`Don't lose ${frogName}!`}
        subtitle="Create a free account so your frog and progress are safe on any device."
      />

      <div className={`relative z-20 flex w-full flex-col items-center px-4 ${ONBOARDING_BODY_CLASS}`}>
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
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card/60 text-sm font-bold tracking-wide transition-all hover:bg-muted/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <GoogleIcon /> Continue with Google
                    </>
                  )}
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 font-bold tracking-widest text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSendEmailLink} className="space-y-3">
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    enterKeyHint="send"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Email address"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-12 rounded-2xl border-border/60 bg-muted/30 text-center focus-visible:ring-primary/30"
                    required
                  />
                  {error ? <ErrorMsg>{error}</ErrorMsg> : null}
                  <button
                    type="submit"
                    disabled={!email.trim() || loading}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send sign-in link'}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="email-sent"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="text-center"
              >
                <p className="text-sm text-foreground">Check your email at</p>
                <p className="mt-1 text-sm font-bold text-foreground">{email}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Tap the link to finish signing in. You can hop in meanwhile.
                </p>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={saving}
                  className="mt-6 h-12 rounded-2xl bg-primary px-8 text-sm font-black uppercase tracking-wider text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Setting up...' : 'Hop in'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-[11px] font-black uppercase tracking-wider text-destructive">
      {children}
    </p>
  );
}
