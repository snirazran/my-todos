'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createEmailLinkSettings } from '@/lib/emailLinkSettings';
import { Input } from '@/components/ui/input';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';

type Step = 'enter' | 'email-sent';

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

const variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function CreateAccountStep({ onNext }: OnboardingStepProps) {
  const [step, setStep] = useState<Step>('enter');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <button
        type="button"
        onClick={onNext}
        className="absolute right-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 rounded-full border-2 border-primary/40 bg-background px-4 py-2 text-sm font-black text-primary shadow-md transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
      >
        Skip for now
      </button>

      <OnboardingFrogHeader
        title="Save your frog!"
        subtitle="Create an account to sync across devices and track your progress."
      />

      <div className={`relative z-20 flex w-full flex-col items-center px-4 ${ONBOARDING_BODY_CLASS}`}>
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {step === 'enter' ? (
              <motion.form
                key="email"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                onSubmit={handleSendEmailLink}
                className="space-y-4"
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-14 rounded-2xl border-border/60 bg-muted/30 text-center focus-visible:ring-primary/30"
                  required
                  autoFocus
                />
                {error ? <ErrorMsg>{error}</ErrorMsg> : null}
                <button
                  type="submit"
                  disabled={!email.trim() || loading}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send sign-in link'}
                </button>
              </motion.form>
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
                  Tap the link to finish. You can keep going meanwhile.
                </p>
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-6 h-12 rounded-2xl bg-primary px-8 text-sm font-black uppercase tracking-wider text-primary-foreground"
                >
                  Continue
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
