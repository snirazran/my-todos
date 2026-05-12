'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import {
  RecaptchaVerifier,
  linkWithPhoneNumber,
  sendSignInLinkToEmail,
  type ConfirmationResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';
import { Input } from '@/components/ui/input';
import type { OnboardingStepProps } from './types';

type Method = 'phone' | 'email';
type Step = 'enter' | 'verify-phone' | 'email-sent';

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

const variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function CreateAccountStep({ onNext }: OnboardingStepProps) {
  const [method, setMethod] = useState<Method>('phone');
  const [step, setStep] = useState<Step>('enter');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
    };
  }, []);

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    recaptchaRef.current = new RecaptchaVerifier(
      auth,
      'onboarding-recaptcha',
      { size: 'invisible' },
    );
    return recaptchaRef.current;
  };

  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed.startsWith('+')) {
      setError('Phone must start with country code (e.g. +1...)');
      return;
    }
    const current = auth.currentUser;
    if (!current) {
      setError('Session expired. Refresh the page.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verifier = ensureRecaptcha();
      const confirmation = await linkWithPhoneNumber(
        current,
        trimmed,
        verifier,
      );
      confirmationRef.current = confirmation;
      setStep('verify-phone');
    } catch (err: any) {
      const map: Record<string, string> = {
        'auth/invalid-phone-number': 'That phone number looks invalid',
        'auth/credential-already-in-use':
          'That phone is already linked to another account',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      };
      setError(map[err?.code ?? ''] ?? err?.message ?? 'Could not send code');
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationRef.current) {
      setError('Verification expired — request a new code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmationRef.current.confirm(code.trim());
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken(true);
        setAuthTokenCookie(token);
        await fetch('/api/user', { method: 'POST' });
      }
      onNext();
    } catch (err: any) {
      const map: Record<string, string> = {
        'auth/invalid-verification-code': 'Wrong code — try again',
        'auth/code-expired': 'Code expired — request a new one',
      };
      setError(map[err?.code ?? ''] ?? err?.message ?? 'Verification failed');
      setLoading(false);
    }
  };

  const handleSendEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      await sendSignInLinkToEmail(auth, trimmed, {
        url: `${origin}/auth/email-callback`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, trimmed);
      setStep('email-sent');
    } catch (err: any) {
      setError(err?.message || 'Could not send email link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center w-full flex-1 pt-2">
      <button
        type="button"
        onClick={onNext}
        className="absolute right-0 top-0 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition"
      >
        Skip
      </button>

      <div className="flex flex-col items-center flex-1 justify-center w-full max-w-sm">
        <div className="text-6xl mb-2">🥚</div>

        <h1 className="text-2xl font-black text-center text-foreground tracking-tight">
          Almost ready to hatch!
        </h1>
        <p className="mt-2 text-sm text-center text-muted-foreground leading-relaxed">
          Create an account to save your frog,
          <br />
          sync across devices, and track your progress.
        </p>

        <div className="w-full mt-8">
          <AnimatePresence mode="wait">
            {step === 'enter' && method === 'phone' && (
              <motion.form
                key="phone"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                onSubmit={handleSendPhoneCode}
                className="space-y-3"
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="Phone number (+1...)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/30 text-center"
                  required
                  autoFocus
                />
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMethod('email');
                  }}
                  className="block mx-auto text-sm font-bold text-primary hover:underline"
                >
                  Use email instead
                </button>
                <button
                  type="submit"
                  disabled={!phone.trim() || loading}
                  className="flex items-center justify-center w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Next'
                  )}
                </button>
              </motion.form>
            )}

            {step === 'enter' && method === 'email' && (
              <motion.form
                key="email"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                onSubmit={handleSendEmailLink}
                className="space-y-3"
              >
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/30 text-center"
                  required
                  autoFocus
                />
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMethod('phone');
                  }}
                  className="block mx-auto text-sm font-bold text-primary hover:underline"
                >
                  Use phone instead
                </button>
                <button
                  type="submit"
                  disabled={!email.trim() || loading}
                  className="flex items-center justify-center w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Send link'
                  )}
                </button>
              </motion.form>
            )}

            {step === 'verify-phone' && (
              <motion.form
                key="verify"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                onSubmit={handleVerifyCode}
                className="space-y-3"
              >
                <p className="text-xs text-center text-muted-foreground">
                  Code sent to {phone}
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/30 text-center tracking-[0.5em] font-bold text-lg"
                  required
                  autoFocus
                />
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('enter');
                    setCode('');
                  }}
                  className="block mx-auto text-sm font-bold text-primary hover:underline"
                >
                  Change number
                </button>
                <button
                  type="submit"
                  disabled={code.length < 6 || loading}
                  className="flex items-center justify-center w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </button>
              </motion.form>
            )}

            {step === 'email-sent' && (
              <motion.div
                key="emailsent"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="text-center"
              >
                <p className="text-sm text-foreground">
                  Check your email at
                </p>
                <p className="text-sm font-bold text-foreground mt-1">
                  {email}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Tap the link to finish. You can keep going meanwhile.
                </p>
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-6 h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm"
                >
                  Continue
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div id="onboarding-recaptcha" />
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-black uppercase tracking-wider text-center text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2">
      {children}
    </p>
  );
}
