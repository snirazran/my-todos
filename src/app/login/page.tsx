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
    <main className="relative flex items-center justify-center w-full h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] p-4 pb-32 md:pb-60 overflow-hidden bg-background">
      {/* ─── Decorative Blobs ─── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 blur-[100px] rounded-full pointer-events-none z-0" />

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
          <Card className="overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-border/50 bg-card/80 backdrop-blur-2xl rounded-[32px] pt-12">
            <CardHeader className="pt-2 pb-6 text-center">
              <CardTitle className="text-3xl font-black tracking-tighter uppercase text-foreground">
                Welcome back
              </CardTitle>
              <p className="text-sm font-bold tracking-wide text-muted-foreground">
                I'm Hungry!
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {errs.server && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 text-[11px] font-black uppercase tracking-wider text-center text-destructive border border-destructive/50 rounded-2xl bg-destructive/10"
                >
                  {errs.server}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* email */}
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[10px] uppercase font-black tracking-[0.15em] text-muted-foreground ml-1"
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
                      className={`h-12 pl-11 rounded-2xl bg-muted/50 border-border transition-all focus:ring-primary/20 focus:border-primary/50 ${
                        errs.email
                          ? 'border-destructive/50 focus:ring-destructive/10'
                          : ''
                      }`}
                    />
                    <Mail className="absolute z-10 w-4 h-4 transition-colors left-4 top-4 text-muted-foreground group-focus-within:text-primary" />
                  </div>
                  {errs.email && <FieldError msg={errs.email} />}
                </div>

                {/* password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label
                      htmlFor="password"
                      className="text-[10px] uppercase font-black tracking-[0.15em] text-muted-foreground"
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
                      className={`h-12 pl-11 rounded-2xl bg-muted/50 border-border transition-all focus:ring-primary/20 focus:border-primary/50 ${
                        errs.password
                          ? 'border-destructive/50 focus:ring-destructive/10'
                          : ''
                      }`}
                    />
                    <Lock className="absolute z-10 w-4 h-4 transition-colors left-4 top-4 text-muted-foreground group-focus-within:text-primary" />
                  </div>
                  {errs.password && <FieldError msg={errs.password} />}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 mt-2 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-[0.1em] rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
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

            <CardFooter className="flex flex-col gap-4 py-6 border-t bg-muted/30 border-border">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="ml-1 text-primary hover:underline decoration-2 underline-offset-4"
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
