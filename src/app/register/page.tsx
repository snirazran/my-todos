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
          className="relative z-20 point er-events-none -mb-9"
        >
          <div className="relative w-48 h-48 ">
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
              <CardTitle className="text-xl">Create an account</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {serverErr && (
                <div className="p-3 text-xs font-medium text-center text-red-600 border border-red-100 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-900/30 animate-pulse">
                  {serverErr}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="name"
                      placeholder="John Doe"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 pl-10 transition-all focus:scale-[1.01]"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 pl-10 transition-all focus:scale-[1.01]"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      className="h-10 pl-10 pr-10 transition-all focus:scale-[1.01]"
                    />
                    <button
                      type="button"
                      onClick={toggle1}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-10 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <Input
                      id="confirm-password"
                      type={showPw2 ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                      className="h-10 pl-10 pr-10 transition-all focus:scale-[1.01]"
                    />
                    <button
                      type="button"
                      onClick={toggle2}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-10 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white mt-2 shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.02]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Sign Up'
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center pt-4 pb-4 border-t border-slate-100/50 dark:border-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-medium transition-colors text-violet-600 hover:text-violet-500 hover:underline"
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
