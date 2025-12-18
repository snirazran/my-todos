'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Eye, EyeOff, User, Mail, Lock, Loader2 } from 'lucide-react';
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

export default function RegisterPage() {
  const router = useRouter();

  /* ───────── state ───────── */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  /* ───────── helpers ───────── */
  const toggle1 = () => setShowPw(!showPw);
  const toggle2 = () => setShowPw2(!showPw2);

  /* ───────── submit ───────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErr(null);

    /* local checks */
    if (pw !== pw2) {
      setServerErr('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      /* 1️⃣  create the user */
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: pw }),
      });

      if (!res.ok) {
        const { error, details } = await res.json().catch(() => ({}));
        setServerErr(
          error === 'Validation failed'
            ? Object.values(details ?? {})
                .flat()
                .join(' · ')
            : error || 'An error occurred — please try again'
        );
        return;
      }

      /* 2️⃣  log-in immediately */
      await signIn('credentials', {
        email,
        password: pw,
        redirect: true,
        callbackUrl: '/', // landing page after auto-login
      });
      /* signIn handles the redirect – no router.push() needed */
    } catch {
      setServerErr('An error occurred — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  /* ───────── UI ───────── */
  return (
    <main className="relative flex items-center justify-center w-full min-h-screen p-4 pb-24 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 md:pb-40">
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
          className="relative z-20 -mb-12 pointer-events-none"
        >
          <div className="relative">
            <Frog
              width={260}
              height={260}
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
          <Card className="overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-white/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[32px] pt-12">
            <CardHeader className="pt-2 pb-6 text-center">
              <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-800 dark:text-white">
                Create Account
              </CardTitle>
              <p className="text-sm font-bold tracking-wide text-slate-400 dark:text-slate-500">
                FEED ME! *please*
              </p>
            </CardHeader>

            <CardContent className="space-y-5">
              {serverErr && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 text-[11px] font-black uppercase tracking-wider text-center text-red-500 border border-red-200/50 rounded-2xl bg-red-50/50 dark:bg-red-900/20 dark:border-red-900/30"
                >
                  {serverErr}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="name"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500 ml-1"
                  >
                    Full Name
                  </Label>
                  <div className="relative group">
                    <Input
                      id="name"
                      placeholder="John Doe"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="transition-all h-11 pl-11 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-800 focus:ring-violet-500/20 focus:border-violet-500/50"
                    />
                    <User className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors z-10" />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500 ml-1"
                  >
                    Email
                  </Label>
                  <div className="relative group">
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="transition-all h-11 pl-11 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-800 focus:ring-violet-500/20 focus:border-violet-500/50"
                    />
                    <Mail className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors z-10" />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500 ml-1"
                  >
                    Password
                  </Label>
                  <div className="relative group">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      className="transition-all h-11 pl-11 pr-11 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-800 focus:ring-violet-500/20 focus:border-violet-500/50"
                    />
                    <Lock className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors z-10" />
                    <button
                      type="button"
                      onClick={toggle1}
                      className="absolute inset-y-0 right-0 z-10 flex items-center justify-center w-10 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm-password"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 dark:text-slate-500 ml-1"
                  >
                    Confirm Password
                  </Label>
                  <div className="relative group">
                    <Input
                      id="confirm-password"
                      type={showPw2 ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                      className="transition-all h-11 pl-11 pr-11 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-800 focus:ring-violet-500/20 focus:border-violet-500/50"
                    />
                    <Lock className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors z-10" />
                    <button
                      type="button"
                      onClick={toggle2}
                      className="absolute inset-y-0 right-0 z-10 flex items-center justify-center w-10 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 mt-2 bg-violet-600 hover:bg-violet-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-lg shadow-violet-500/25 transition-all active:scale-[0.98]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Sign Up'
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 py-6 border-t bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/50">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="ml-1 text-violet-600 dark:text-violet-400 hover:underline decoration-2 underline-offset-4"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
