'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Frog from '@/components/ui/frog';

/* tiny helper */
const mailRx = /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/;

export default function LoginPage() {
  const router = useRouter();

  /* form state */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* validation & server errors */
  const [errs, setErrs] = useState<{
    email?: string;
    password?: string;
    server?: string;
  }>({});

  /* -------------- submit -------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrs: typeof errs = {};

    /* 1️⃣ client-side validation (EN) */
    if (!email.trim()) nextErrs.email = 'Email is required';
    else if (!mailRx.test(email)) nextErrs.email = 'Invalid email address';

    if (!password) nextErrs.password = 'Password is required';
    else if (password.length < 8) nextErrs.password = 'At least 8 characters';

    setErrs(nextErrs);
    if (Object.keys(nextErrs).length) return;

    /* 2️⃣ sign-in */
    setSubmitting(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setSubmitting(false);

    if (res?.ok) return router.push('/');

    /* 3️⃣ server-side errors (EN) */
    if (res?.error === 'CredentialsSignin') {
      setErrs({ server: 'Incorrect email or password' });
    } else {
      setErrs({ server: 'An error occurred — please try again' });
    }
  };

  /* -------------- UI -------------- */
  return (
    <main className="relative flex items-center justify-center w-full overflow-hidden bg-slate-50 dark:bg-slate-900 h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)]">
      {/* ─── Animated Background ─── */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-transparent to-transparent dark:from-violet-900/20 opacity-70" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        {/* ─── The Peeking Frog ─── */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            delay: 0.2,
            type: 'spring',
            stiffness: 120,
            damping: 15,
          }}
          className="relative z-20 pointer-events-none -mb-9"
        >
          <div className="relative w-48 h-48">
            <Frog
              width={192}
              height={192}
              indices={{ skin: 0, hat: 0, scarf: 0, hand_item: 0 }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
          className="w-full"
        >
          <Card className="relative z-10 pt-12 shadow-2xl border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
            <CardHeader className="pt-2 pb-2 text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {errs.server && (
                <div className="p-3 text-xs font-medium text-center text-red-600 border border-red-100 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-900/30 animate-pulse">
                  {errs.server}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`h-10 pl-10 transition-all focus:scale-[1.01] ${
                        errs.email
                          ? 'border-red-500 focus-visible:ring-red-500'
                          : ''
                      }`}
                    />
                  </div>
                  {errs.email && <FieldError msg={errs.email} />}
                </div>

                {/* password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`h-10 pl-10 transition-all focus:scale-[1.01] ${
                        errs.password
                          ? 'border-red-500 focus-visible:ring-red-500'
                          : ''
                      }`}
                    />
                  </div>
                  {errs.password && <FieldError msg={errs.password} />}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.02]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center pt-4 pb-4 border-t border-slate-100/50 dark:border-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="font-medium transition-colors text-violet-600 hover:text-violet-500 hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

/* small helper component */
function FieldError({ msg }: { msg: string }) {
  return (
    <p className="text-xs font-medium text-red-600 animate-in slide-in-from-left-1">
      {msg}
    </p>
  );
}
