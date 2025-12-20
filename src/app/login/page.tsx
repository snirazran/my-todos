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
    <main className="relative flex items-center justify-center w-full h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] p-4 pb-32 md:pb-60 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black dark:to-black">
      {/* ─── Decorative Blobs ─── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-violet-500/10 dark:bg-violet-400/5 blur-[100px] rounded-full pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        {/* ─── The Peeking Frog ─── */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 100,
            damping: 20,
          }}
          className="relative z-20 -mb-10 pointer-events-none"
        >
          <div className="relative">
            <Frog
              width={240}
              height={240}
              indices={{ skin: 0, hat: 0, scarf: 0, hand_item: 0 }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <Card className="overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-white/50 dark:border-white/10 bg-white/80 dark:bg-black/70 backdrop-blur-2xl rounded-[32px] pt-12">
            <CardHeader className="pt-2 pb-6 text-center">
              <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-800 dark:text-white">
                Welcome back
              </CardTitle>
              <p className="text-sm font-bold tracking-wide text-slate-400 dark:text-slate-500">
                I'm Hungry!
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {errs.server && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 text-[11px] font-black uppercase tracking-wider text-center text-red-500 border border-red-200/50 rounded-2xl bg-red-50/50 dark:bg-red-900/20 dark:border-red-900/30"
                >
                  {errs.server}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* email */}
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500 ml-1"
                  >
                    Email Address
                  </Label>
                  <div className="relative group">
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`h-12 pl-11 rounded-2xl bg-slate-100/50 dark:bg-white/5 border-slate-200/50 dark:border-white/10 transition-all focus:ring-violet-500/20 focus:border-violet-500/50 ${
                        errs.email
                          ? 'border-red-500/50 focus:ring-red-500/10'
                          : ''
                      }`}
                    />
                    <Mail className="absolute z-10 w-4 h-4 transition-colors left-4 top-4 text-slate-400 group-focus-within:text-violet-500" />
                  </div>
                  {errs.email && <FieldError msg={errs.email} />}
                </div>

                {/* password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label
                      htmlFor="password"
                      className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500"
                    >
                      Password
                    </Label>
                  </div>
                  <div className="relative group">
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`h-12 pl-11 rounded-2xl bg-slate-100/50 dark:bg-white/5 border-slate-200/50 dark:border-white/10 transition-all focus:ring-violet-500/20 focus:border-violet-500/50 ${
                        errs.password
                          ? 'border-red-500/50 focus:ring-red-500/10'
                          : ''
                      }`}
                    />
                    <Lock className="absolute z-10 w-4 h-4 transition-colors left-4 top-4 text-slate-400 group-focus-within:text-violet-500" />
                  </div>
                  {errs.password && <FieldError msg={errs.password} />}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 mt-2 bg-violet-600 hover:bg-violet-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-lg shadow-violet-500/25 transition-all active:scale-[0.98]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 py-6 border-t bg-slate-50/50 dark:bg-white/5 border-slate-100 dark:border-white/10">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="ml-1 text-violet-600 dark:text-violet-400 hover:underline decoration-2 underline-offset-4"
                >
                  Create one
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
    <p className="text-[10px] font-black uppercase tracking-wider text-red-500 ml-1 animate-in fade-in slide-in-from-top-1">
      {msg}
    </p>
  );
}
