'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  FROG_TONGUE_MOUTH_OFFSET_TABLET,
  FROG_TONGUE_MOUTH_OFFSET_DESKTOP,
  type FrogHandle,
} from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNotification } from '@/components/providers/NotificationProvider';
import { DEFAULT_BACKGROUND_IMAGES } from '@/hooks/useBackgrounds';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const FLY_KEY = 'welcome-fly';
const FLY_BUZZ = {
  x: [-56, 56, -38, 48, -56],
  y: [0, -18, 6, -10, 0],
  rotate: [-6, 6, -4, 8, -6],
  transition: { duration: 6, ease: 'easeInOut', repeat: Infinity },
} as const;

const ENTER_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
} as const;

const ENTER_ITEM = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

const ENTER_FROG = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 220, damping: 17 },
  },
} as const;

export default function WelcomePage() {
  const router = useRouter();
  const { showNotification } = useNotification();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [adoptionSucceeded, setAdoptionSucceeded] = useState(false);
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const tongueMouthOffset = isDesktop
    ? FROG_TONGUE_MOUTH_OFFSET_DESKTOP
    : isTablet
      ? FROG_TONGUE_MOUTH_OFFSET_TABLET
      : FROG_TONGUE_MOUTH_OFFSET;
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
    keepTargetHiddenUntilPersist: true,
  });

  const flyCaught = visuallyDone.has(FLY_KEY);

  // Warm up the onboarding route and its background so the transition after
  // "Adopt your frog" doesn't pay the compile/image cost.
  useEffect(() => {
    router.prefetch('/onboarding');
    const img = new window.Image();
    if (window.matchMedia('(min-width: 1280px)').matches) {
      img.src = DEFAULT_BACKGROUND_IMAGES.web;
    } else if (window.matchMedia('(min-width: 768px)').matches) {
      img.src = DEFAULT_BACKGROUND_IMAGES.tablet;
    } else {
      img.src = DEFAULT_BACKGROUND_IMAGES.mobile;
    }
  }, [router]);

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
      <motion.div
        variants={ENTER_CONTAINER}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
        className="flex w-full max-w-sm origin-center flex-col items-center md:scale-110 xl:scale-125"
      >
        <motion.div variants={ENTER_ITEM}>
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
        </motion.div>

        <motion.p
          variants={ENTER_ITEM}
          className="mb-2 max-w-xs text-center text-sm text-muted-foreground"
        >
          Time{' '}
          <span className="font-black italic text-primary">flies</span>
          {' '}when you&apos;re getting things done.
        </motion.p>

        <motion.div variants={ENTER_FROG} className="relative z-10 w-full">
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
              mouthOffset={tongueMouthOffset}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
          </div>
        </motion.div>

        <motion.div variants={ENTER_ITEM} className="relative z-0 w-full space-y-3">
          <motion.button
            onClick={handleHatch}
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Adopt your frog'
            )}
          </motion.button>

          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-card/60 text-sm font-bold tracking-wide transition-all hover:bg-muted/50 active:scale-[0.98]"
          >
            I already have a frog
          </Link>
        </motion.div>

        <motion.p
          variants={ENTER_ITEM}
          className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground"
        >
          By continuing, you agree to our{' '}
          <Link
            href="/terms"
            className="font-semibold text-foreground/70 underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="font-semibold text-foreground/70 underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
        </motion.p>
      </motion.div>

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
