'use client';

import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Mode = 'login' | 'register' | null;
type Step = 0 | 1 | 2;

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

function getPasswordStrength(pw: string) {
  if (!pw.length) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return [
    { score: 1, label: 'Weak', color: 'bg-red-400' },
    { score: 2, label: 'Fair', color: 'bg-orange-400' },
    { score: 3, label: 'Good', color: 'bg-yellow-400' },
    { score: 4, label: 'Strong', color: 'bg-primary' },
  ][Math.max(0, score - 1)];
}

const slide = {
  enter: (dir: number) => ({ x: dir * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -50, opacity: 0 }),
};

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
  }, []);

  const advance = (next: Step) => {
    setDir(1);
    setStep(next);
  };
  const back = () => {
    setError(null);
    setDir(-1);
    if (step === 1) {
      setMode(null);
      setStep(0);
    } else if (step === 2) setStep(1);
  };

  const pickMode = (m: Mode) => {
    setError(null);
    setMode(m);
    advance(1);
    setTimeout(() => emailRef.current?.focus(), 300);
  };

  const goToPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    advance(2);
    setTimeout(() => passwordRef.current?.focus(), 300);
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
        const result = await signInWithCredential(auth, cred);
        const token = await result.user.getIdToken();
        setAuthTokenCookie(token);
        await fetch('/api/user', { method: 'POST' });
        router.push('/');
      } else {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const token = await result.user.getIdToken();
        setAuthTokenCookie(token);
        const res = await fetch('/api/user', { method: 'POST' });
        const data = await res.json();
        router.push(
          mode === 'register' && data.isNewUser ? '/onboarding' : '/',
        );
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const uc = await signInWithEmailAndPassword(auth, email, password);
      const token = await uc.user.getIdToken();
      setAuthTokenCookie(token);
      await fetch('/api/user', { method: 'POST' });
      router.push('/');
    } catch (err: any) {
      const codes: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password',
        'auth/user-not-found': 'Invalid email or password',
        'auth/wrong-password': 'Invalid email or password',
        'auth/invalid-email': 'Invalid email address',
        'auth/network-request-failed': 'Network error — check your connection',
      };
      setError(codes[err.code] ?? `Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const uc = await createUserWithEmailAndPassword(auth, email, password);
      const token = await uc.user.getIdToken();
      setAuthTokenCookie(token);
      const res = await fetch('/api/user', { method: 'POST' });
      const data = await res.json();
      router.push(data.isNewUser ? '/onboarding' : '/');
    } catch (err: any) {
      const codes: Record<string, string> = {
        'auth/email-already-in-use': 'Email is already in use',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
      };
      setError(codes[err.code] ?? 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(password);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  return (
    <main className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-background">
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm -translate-y-8">
        {/* Frog */}
        <div className="relative z-20 pointer-events-none -mb-9">
          <Frog
            width={200}
            height={200}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>

        {/* Card */}
        <div className="w-full overflow-hidden rounded-[32px] border border-border/50 bg-card/80 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <div className="px-6 pt-10 pb-2">
            <AnimatePresence mode="wait" custom={dir}>
              {/* ── Step 0: Choose path ── */}
              {step === 0 && (
                <motion.div
                  key="choice"
                  custom={dir}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="mb-8 text-center">
                    <h1 className="text-3xl font-black tracking-tight text-foreground">
                      Hoppy to see you!
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Do you already have a frog,
                      <br />
                      or are you here to adopt one?
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => pickMode('login')}
                      className="group relative w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/30"
                    >
                      I already have a frog
                    </button>
                    <button
                      onClick={() => pickMode('register')}
                      className="w-full py-4 text-sm font-black tracking-widest uppercase transition-all bg-transparent border-2 rounded-2xl border-border/60 hover:bg-muted/40 text-foreground"
                    >
                      Adopt a frog
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 1: Email ── */}
              {step === 1 && (
                <motion.div
                  key="email"
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
                        {mode === 'register'
                          ? 'Nice to *ribbit* meet you'
                          : 'I *ribbit* missed you'}
                      </h1>
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

                  <form onSubmit={goToPassword} className="space-y-4">
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
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </motion.div>
              )}

              {/* ── Step 2: Password ── */}
              {step === 2 && (
                <motion.div
                  key="password"
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
                        {mode === 'register' ? 'Almost there' : 'One step away'}
                      </h1>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {email}
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={mode === 'login' ? handleSignIn : handleRegister}
                    className="space-y-4"
                  >
                    {/* Password */}
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="password"
                        className="ml-1 text-xs font-bold uppercase text-muted-foreground"
                      >
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          ref={passwordRef}
                          id="password"
                          type={showPw ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30 pr-11"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute transition -translate-y-1/2 right-3 top-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPw ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {mode === 'register' && password.length > 0 && (
                        <div className="flex items-center gap-2 px-1">
                          <div className="flex flex-1 gap-1">
                            {[1, 2, 3, 4].map((bar) => (
                              <div
                                key={bar}
                                className={cn(
                                  'h-1 flex-1 rounded-full transition-all duration-300',
                                  bar <= strength.score
                                    ? strength.color
                                    : 'bg-border/40',
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            {strength.label}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Confirm password (register only) */}
                    {mode === 'register' && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="confirm"
                          className="ml-1 text-xs font-bold uppercase text-muted-foreground"
                        >
                          Confirm Password
                        </Label>
                        <div className="relative">
                          <Input
                            id="confirm"
                            type={showConfirm ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={cn(
                              'h-12 rounded-xl bg-background/50 focus-visible:ring-primary/30 pr-11',
                              passwordsMismatch
                                ? 'border-destructive/60'
                                : passwordsMatch
                                  ? 'border-primary/50'
                                  : 'border-border/60',
                            )}
                            required
                          />
                          <div className="absolute flex items-center gap-1 -translate-y-1/2 right-3 top-1/2">
                            {confirm.length > 0 && (
                              <motion.span
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                              >
                                {passwordsMatch ? (
                                  <Check className="w-4 h-4 text-primary" />
                                ) : (
                                  <X className="w-4 h-4 text-destructive" />
                                )}
                              </motion.span>
                            )}
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setShowConfirm((v) => !v)}
                              className="ml-1 transition text-muted-foreground hover:text-foreground"
                            >
                              {showConfirm ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && <ErrorMsg>{error}</ErrorMsg>}

                    <button
                      type="submit"
                      disabled={
                        loading || (mode === 'register' && !passwordsMatch)
                      }
                      className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : mode === 'login' ? (
                        'Sign In'
                      ) : (
                        'Create Account'
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 mt-3 text-center border-t bg-muted/30 border-border">
            {step === 0 ? (
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                By continuing you agree to our{' '}
                <span className="cursor-pointer text-primary hover:underline">
                  Terms
                </span>
              </p>
            ) : mode === 'login' ? (
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                No frog yet?{' '}
                <button
                  onClick={() => {
                    setError(null);
                    setMode('register');
                    setStep(1);
                  }}
                  className="ml-1 text-primary hover:underline decoration-2 underline-offset-4"
                >
                  Adopt one
                </button>
              </p>
            ) : (
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Already have a frog?{' '}
                <button
                  onClick={() => {
                    setError(null);
                    setMode('login');
                    setStep(1);
                  }}
                  className="ml-1 text-primary hover:underline decoration-2 underline-offset-4"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
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
