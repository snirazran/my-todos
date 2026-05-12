'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { signInAnonymously } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleHatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInAnonymously(auth);
      const token = await cred.user.getIdToken();
      setAuthTokenCookie(token);
      await fetch('/api/user', { method: 'POST' });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Could not start your frog');
      setLoading(false);
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-between p-6 pt-20 pb-10 overflow-hidden bg-background">
      <div className="flex flex-col items-center flex-1 justify-center">
        <div className="pointer-events-none">
          <Frog
            width={220}
            height={220}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>
        <h1 className="mt-2 text-5xl font-black tracking-tight text-foreground">
          FrogTask
        </h1>
        <p className="mt-3 text-base text-muted-foreground text-center max-w-xs">
          Your new productivity best friend.
        </p>
      </div>

      <div className="flex flex-col items-center w-full max-w-sm gap-4">
        {error && (
          <p className="text-[11px] font-black uppercase tracking-wider text-center text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 w-full">
            {error}
          </p>
        )}

        <button
          onClick={handleHatch}
          disabled={loading}
          className="flex items-center justify-center w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            'Hatch a new frog'
          )}
        </button>

        <Link
          href="/login"
          className="text-sm font-bold tracking-wide text-foreground/80 hover:text-foreground transition"
        >
          Login
        </Link>

        <p className="text-[11px] text-center text-muted-foreground leading-relaxed mt-2">
          By continuing, you agree to our{' '}
          <span className="text-primary cursor-pointer hover:underline">
            Terms of Service
          </span>{' '}
          and{' '}
          <span className="text-primary cursor-pointer hover:underline">
            Privacy Policy
          </span>
        </p>
      </div>
    </main>
  );
}
