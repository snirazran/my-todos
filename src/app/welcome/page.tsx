'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { signInAnonymously } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });
const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

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
    <main className="fixed inset-0 flex flex-col items-center justify-between px-6 pt-20 pb-10 overflow-hidden bg-background md:justify-center md:gap-16">
      <div className="flex flex-col items-center justify-center flex-1 md:flex-none">
        <div className="flex flex-col items-center scale-[1.1] md:scale-[1.3] origin-bottom">
          {/* Frog overlapping the deck — matches FrogDisplay layout */}
          <div className="relative z-50 -mb-10 pointer-events-none" style={{ transform: 'translateY(-1px)' }}>
            <motion.div
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 z-10"
              style={{ top: '-8%' }}
              animate={{
                x: [-60, 60, -40, 50, -60],
                y: [0, -18, 6, -10, 0],
                rotate: [-6, 6, -4, 8, -6],
              }}
              transition={{
                duration: 6,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            >
              <Fly size={42} interactive={false} />
            </motion.div>
            <Frog
              width={220}
              height={220}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>

          {/* The deck — clean nameplate */}
          <div className="relative z-10 flex items-center justify-center w-[260px] max-w-[min(90vw,100%)] min-h-[64px] py-3 px-6 rounded-2xl border-2 border-border/40 bg-background">
            <span
              className="text-[26px] font-black tracking-tight text-foreground leading-tight"
              style={{ letterSpacing: '-0.025em', paddingBottom: '2px' }}
            >
              FrogTask
            </span>
          </div>
        </div>

        <p className="mt-6 text-base text-muted-foreground text-center max-w-xs md:text-lg md:max-w-md">
          Time flies when you&apos;re getting things done.
        </p>
      </div>

      <div className="flex flex-col items-center w-full max-w-sm gap-4">
          {error && (
            <p className="text-[11px] font-black uppercase tracking-wider text-center text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 w-full">
              {error}
            </p>
          )}

          <motion.button
            onClick={handleHatch}
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full md:w-80 h-14 rounded-2xl font-bold text-base tracking-wide transition-all duration-200 bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Adopt a new frog'
            )}
          </motion.button>

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
