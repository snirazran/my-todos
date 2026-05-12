'use client';

import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  sendSignInLinkToEmail,
  type ConfirmationResult,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Method = 'phone' | 'email';
type Step = 'enter' | 'verify-phone' | 'email-sent';

const GOOGLE_ICON = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 488 512"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="currentColor"
      d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
    />
  </svg>
);

const slide = {
  enter: (dir: number) => ({ x: dir * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -50, opacity: 0 }),
};

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('phone');
  const [step, setStep] = useState<Step>('enter');
  const [dir, setDir] = useState(1);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void SocialLogin.initialize({
        google: {
          webClientId:
            '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
          iOSClientId:
            '324868480648-qv2h2spg5jl3mmhek4u6vvefm7k7m0f4.apps.googleusercontent.com',
          iOSServerClientId:
            '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
          mode: 'online',
        },
      });
    }

    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
    };
  }, []);

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
    return recaptchaRef.current;
  };

  const finishSignIn = async (route = '/') => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    setAuthTokenCookie(token);
    const res = await fetch('/api/user', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    router.push(data?.isNewUser ? '/onboarding' : route);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
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
        await signInWithCredential(auth, cred);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
      await finishSignIn();
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed.startsWith('+')) {
      setError('Phone must start with country code (e.g. +1...)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, trimmed, verifier);
      confirmationRef.current = confirmation;
      setDir(1);
      setStep('verify-phone');
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const map: Record<string, string> = {
        'auth/invalid-phone-number': 'That phone number looks invalid',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/quota-exceeded': 'SMS quota exceeded. Try again later.',
      };
      setError(map[code ?? ''] ?? err?.message ?? 'Could not send code');
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationRef.current) {
      setError('Verification expired — please request a new code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmationRef.current.confirm(code.trim());
      await finishSignIn();
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
      setDir(1);
      setStep('email-sent');
    } catch (err: any) {
      setError(err?.message || 'Could not send email link');
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    setError(null);
    setDir(-1);
    setStep('enter');
    setCode('');
  };

  return (
    <main className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-background">
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm -translate-y-8">
        <div className="relative z-20 pointer-events-none -mb-9">
          <Frog
            width={200}
            height={200}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>

        <div className="w-full overflow-hidden rounded-[32px] border border-border/50 bg-card/80 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <div className="px-6 pt-10 pb-2">
            <AnimatePresence mode="wait" custom={dir}>
              {step === 'enter' && (
                <motion.div
                  key="enter"
                  custom={dir}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <Link
                      href="/welcome"
                      className="flex items-center justify-center transition border rounded-full w-9 h-9 border-border/60 bg-background text-muted-foreground hover:bg-muted shrink-0"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                      <h1 className="text-xl font-black leading-tight tracking-tight uppercase text-foreground">
                        Welcome back!
                      </h1>
                      <p className="text-xs text-muted-foreground">
                        {method === 'phone'
                          ? "We'll text you a verification code"
                          : "We'll email you a sign-in link"}
                      </p>
                    </div>
                  </div>

                  {method === 'phone' ? (
                    <form onSubmit={handleSendPhoneCode} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="phone"
                          className="ml-1 text-xs font-bold uppercase text-muted-foreground"
                        >
                          Phone number
                        </Label>
                        <Input
                          ref={phoneRef}
                          id="phone"
                          type="tel"
                          inputMode="tel"
                          placeholder="+1 555 123 4567"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="h-12 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30"
                          required
                          autoFocus
                        />
                      </div>
                      {error && <ErrorMsg>{error}</ErrorMsg>}
                      <button
                        type="submit"
                        disabled={!phone.trim() || loading}
                        className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Next <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setMethod('email');
                          setTimeout(() => emailRef.current?.focus(), 50);
                        }}
                        className="block w-full mt-2 text-xs font-bold tracking-wide text-primary hover:underline"
                      >
                        Use email instead
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleSendEmailLink} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="email"
                          className="ml-1 text-xs font-bold uppercase text-muted-foreground"
                        >
                          Email
                        </Label>
                        <Input
                          ref={emailRef}
                          id="email"
                          type="email"
                          placeholder="hello@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-12 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30"
                          required
                          autoFocus
                        />
                      </div>
                      {error && <ErrorMsg>{error}</ErrorMsg>}
                      <button
                        type="submit"
                        disabled={!email.trim() || loading}
                        className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Send sign-in link'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setMethod('phone');
                          setTimeout(() => phoneRef.current?.focus(), 50);
                        }}
                        className="block w-full mt-2 text-xs font-bold tracking-wide text-primary hover:underline"
                      >
                        Use phone instead
                      </button>
                    </form>
                  )}

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/60" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="px-2 font-bold tracking-widest bg-card text-muted-foreground">
                        Or
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="flex items-center justify-center w-full h-12 gap-3 text-sm font-bold tracking-wide transition-all border rounded-2xl border-border bg-background hover:bg-muted/50"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>{GOOGLE_ICON} Continue with Google</>
                    )}
                  </button>
                </motion.div>
              )}

              {step === 'verify-phone' && (
                <motion.div
                  key="verify"
                  custom={dir}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <button
                      onClick={back}
                      className="flex items-center justify-center transition border rounded-full w-9 h-9 border-border/60 bg-background text-muted-foreground hover:bg-muted shrink-0"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h1 className="text-xl font-black leading-tight tracking-tight uppercase text-foreground">
                        Enter the code
                      </h1>
                      <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                        Sent to {phone}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleVerifyPhoneCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="code"
                        className="ml-1 text-xs font-bold uppercase text-muted-foreground"
                      >
                        Verification code
                      </Label>
                      <Input
                        ref={codeRef}
                        id="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        className="h-12 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30 tracking-[0.5em] text-center font-bold"
                        required
                      />
                    </div>
                    {error && <ErrorMsg>{error}</ErrorMsg>}
                    <button
                      type="submit"
                      disabled={code.length < 6 || loading}
                      className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Verify'
                      )}
                    </button>
                  </form>
                </motion.div>
              )}

              {step === 'email-sent' && (
                <motion.div
                  key="emailsent"
                  custom={dir}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center py-6"
                >
                  <h1 className="text-2xl font-black tracking-tight text-foreground">
                    Check your email
                  </h1>
                  <p className="mt-3 text-sm text-muted-foreground">
                    We sent a sign-in link to
                    <br />
                    <span className="font-bold text-foreground">{email}</span>
                  </p>
                  <button
                    onClick={back}
                    className="mt-6 text-xs font-bold tracking-wide text-primary hover:underline"
                  >
                    Use a different method
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="px-6 py-4 mt-3 text-center border-t bg-muted/30 border-border">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              No frog yet?{' '}
              <Link
                href="/welcome"
                className="ml-1 text-primary hover:underline decoration-2 underline-offset-4"
              >
                Hatch one
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div id="recaptcha-container" />
    </main>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[11px] font-black uppercase tracking-wider text-center text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2"
    >
      {children}
    </motion.p>
  );
}
