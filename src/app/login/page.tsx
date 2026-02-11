'use client';

import { useState } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
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
import dynamic from 'next/dynamic';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

/* tiny helper */

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      // Get ID token
      const token = await result.user.getIdToken();

      // Set cookie for middleware
      document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Strict`;

      // Sync user to MongoDB
      await fetch('/api/user', {
        method: 'POST',
      });

      // Redirect
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // 2. Get ID token
      const token = await user.getIdToken();

      // 3. Set Cookie
      document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Strict`;

      // 4. Sync user to MongoDB
      await fetch('/api/user', {
        method: 'POST',
      });

      // 5. Redirect
      router.push('/');
    } catch (err: any) {
      console.error(err);
      let msg = 'Failed to sign in';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        msg = 'Invalid email or password';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address';
      }
      setError(msg);
    } finally {
      setLoading(false);
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
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 text-[11px] font-black uppercase tracking-wider text-center text-destructive border border-destructive/50 rounded-2xl bg-destructive/10"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="email"
                    className="text-xs font-bold uppercase text-muted-foreground ml-1"
                  >
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="hello@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold uppercase text-muted-foreground ml-1"
                  >
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/30"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 mt-2 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground font-bold tracking-widest">
                    Or
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-12 rounded-2xl border-border bg-background hover:bg-muted/50 font-bold tracking-wide transition-all"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                      focusable="false"
                      data-prefix="fab"
                      data-icon="google"
                      role="img"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 488 512"
                    >
                      <path
                        fill="currentColor"
                        d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                      ></path>
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
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
