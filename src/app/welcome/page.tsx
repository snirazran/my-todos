'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const FLY_KEY = 'welcome-fly';
const FLY_BUZZ = {
  x: [-56, 56, -38, 48, -56],
  y: [0, -18, 6, -10, 0],
  rotate: [-6, 6, -4, 8, -6],
  transition: { duration: 6, ease: 'easeInOut', repeat: Infinity },
} as const;

export default function WelcomePage() {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [adoptionSucceeded, setAdoptionSucceeded] = useState(false);
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    vp,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    trackMovingTarget: true,
    durationMs: 1040,
    originYOffset: -9,
    keepTargetHiddenUntilPersist: true,
  });

  const flyCaught = visuallyDone.has(FLY_KEY);

  const handleHatch = async () => {
    setLoading(true);
    await triggerTongue({
      key: FLY_KEY,
      completed: false,
      onPersist: async () => {
        try {
          setAdoptionSucceeded(true);
          router.push('/onboarding');
        } catch (err: any) {
          showNotification(err?.message || 'Could not start your frog');
          setLoading(false);
        }
      },
    });
  };

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
      <div className="flex w-full max-w-sm origin-center flex-col items-center md:scale-110 xl:scale-125">
        <svg
          aria-label="Frogress"
          role="img"
          viewBox="0 0 220 34"
          className="mb-1 h-12 w-[300px] overflow-visible text-foreground"
        >
          <path id="welcome-brand-arc" d="M 36 22 Q 110 6 184 22" fill="none" />
          <text
            fill="currentColor"
            fontSize="20"
            fontWeight="800"
            textAnchor="middle"
            style={{
              fontFamily:
                '"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            <textPath href="#welcome-brand-arc" startOffset="50%">
              Frogress
            </textPath>
          </text>
        </svg>

        <p className="mb-2 max-w-xs text-center text-sm text-muted-foreground">
          Time flies when you&apos;re getting things done.
        </p>

        <div className="pointer-events-none relative z-10 flex w-full translate-y-3 flex-col items-center">
          {!flyCaught && !adoptionSucceeded && (
            <motion.div
              aria-hidden
              className="absolute left-1/2 z-10 -translate-x-1/2"
              style={{ top: '-6%' }}
              animate={FLY_BUZZ as any}
            >
              <div
                ref={(el) => {
                  flyRefs.current[FLY_KEY] = el;
                }}
              >
                <Fly size={38} interactive={false} />
              </div>
            </motion.div>
          )}
          <div ref={frogBoxRef}>
            <Frog
              ref={frogRef}
              mouthOpen={!!grab}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
        </div>

        <div className="w-full space-y-3">
          <motion.button
            onClick={handleHatch}
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Adopt a new frog'
            )}
          </motion.button>

          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-card/60 text-sm font-bold tracking-wide transition-all hover:bg-muted/50 active:scale-[0.98]"
          >
            Login
          </Link>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing, you agree to our{' '}
          <span className="cursor-pointer text-primary hover:underline">
            Terms of Service
          </span>{' '}
          and{' '}
          <span className="cursor-pointer text-primary hover:underline">
            Privacy Policy
          </span>
        </p>
      </div>

      {grab && (
        <svg
          key={grab.startAt}
          className="pointer-events-none fixed inset-0 z-40"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient
              id="welcome-tongue-grad"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#welcome-tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-FLY_PX / 2}
              y={-FLY_PX / 2}
              width={FLY_PX}
              height={FLY_PX}
            />
          </g>
        </svg>
      )}
    </main>
  );
}
