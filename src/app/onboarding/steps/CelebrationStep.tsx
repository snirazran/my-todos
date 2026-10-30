'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { hapticCelebrate, hapticTick } from '@/lib/haptics';
import { preloadRiveAsset, warmRiveRuntime } from '@/lib/riveLoader';
import { cn } from '@/lib/utils';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { ONBOARDING_HEADER_TOP_CLASS, ONBOARDING_TITLE_CLASS } from './OnboardingFrogHeader';

const LEAF_COLORS = ['#93df6e', '#6cc04a', '#4f9a45', '#b7ec8f'];
const SPARK_COLORS = ['#fde68a', '#fbbf24', '#ffffff'];
const ROW_STEP_MS = 520;
const EASE = [0.22, 1, 0.36, 1] as const;

type Row = { key: string; emoji: string; doing: string; done: string };

type Props = {
  humanName?: string | null;
  frogName: string;
  habitCount: number;
  ready: boolean;
};

function celebrate() {
  const leaf = confetti.shapeFromPath({ path: 'M10 0C16 5 17 12 10 20C3 12 4 5 10 0Z' });
  const burst = (originX: number, angle: number) => {
    confetti({
      particleCount: 26,
      angle,
      spread: 55,
      startVelocity: 38,
      gravity: 0.7,
      drift: angle < 90 ? 0.4 : -0.4,
      scalar: 1.3,
      ticks: 260,
      shapes: [leaf],
      colors: LEAF_COLORS,
      origin: { x: originX, y: 0.34 },
      zIndex: 60,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 14,
      angle,
      spread: 70,
      startVelocity: 32,
      scalar: 0.7,
      ticks: 180,
      shapes: ['circle'],
      colors: SPARK_COLORS,
      origin: { x: originX, y: 0.34 },
      zIndex: 60,
      disableForReducedMotion: true,
    });
  };
  burst(0.32, 70);
  burst(0.68, 110);
  hapticCelebrate();
}

export default function CelebrationStep({ humanName, frogName, habitCount, ready }: Props) {
  const reduceMotion = useReducedMotion();
  const { isEnabled: remindersOn } = useNotificationStatus();
  const [ticks, setTicks] = useState(0);
  const celebratedRef = useRef(false);

  const rows: Row[] = [
    { key: 'frog', emoji: '🐸', doing: `Moving ${frogName} in…`, done: `${frogName} moved in` },
    ...(habitCount > 0
      ? [
          {
            key: 'habits',
            emoji: '🌱',
            doing: 'Planting your habits…',
            done: habitCount === 1 ? '1 habit planted' : `${habitCount} habits planted`,
          },
        ]
      : []),
    ...(remindersOn
      ? [{ key: 'reminders', emoji: '🔔', doing: 'Setting up reminders…', done: 'Reminders on' }]
      : []),
    { key: 'pond', emoji: '🪷', doing: 'Filling your pond…', done: 'Your pond is ready' },
  ];
  const last = rows.length - 1;
  const doneCount = Math.min(ticks, ready ? rows.length : last);

  useEffect(() => {
    const timer = window.setInterval(() => setTicks((t) => t + 1), ROW_STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (doneCount === 0) return;
    if (doneCount === rows.length) {
      if (celebratedRef.current) return;
      celebratedRef.current = true;
      celebrate();
      return;
    }
    hapticTick();
  }, [doneCount, rows.length]);

  useEffect(() => {
    warmRiveRuntime();
    void preloadRiveAsset('/idle_gift.riv');
  }, []);

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-[calc(1.25rem+env(safe-area-inset-top)+1px)] z-30 flex justify-center md:-top-10">
        <div className="relative h-[259px] w-[230px] md:h-[315px] md:w-[280px]">
          <FrogSpeechBubble
            rate={0}
            done={0}
            total={0}
            fixedMessage={'Welcome to our pond!\nCome on, I’ll show you.'}
            className="!top-[162px] short:!top-[138px] md:!top-[197px]"
          />
        </div>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 z-20 flex flex-col items-center px-5 text-center',
          ONBOARDING_HEADER_TOP_CLASS,
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex justify-center"
        >
          <h1 className={ONBOARDING_TITLE_CLASS}>
            You&apos;re all set{humanName ? `, ${humanName}` : ''}!
          </h1>
        </motion.div>

        <ul aria-live="polite" className="mt-5 flex w-full max-w-sm flex-col gap-2.5 text-left short:mt-3.5 short:gap-2">
          {rows.map((row, index) => {
            const shown = index <= doneCount;
            const done = index < doneCount;
            return (
              <motion.li
                key={row.key}
                initial={{ opacity: 0, y: 12 }}
                animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="flex items-center gap-3 rounded-[18px] border-2 border-border/60 bg-card px-3 py-2.5 shadow-[0_3px_0_0_rgba(0,0,0,0.05)] short:py-2"
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70 text-xl leading-none"
                >
                  {row.emoji}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 text-[15px] font-bold leading-snug transition-colors duration-200',
                    done ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {done ? row.done : row.doing}
                </span>
                <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center">
                  {done ? (
                    <motion.span
                      initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                      className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"
                    >
                      <Check className="h-4 w-4" strokeWidth={3.5} />
                    </motion.span>
                  ) : (
                    <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary motion-reduce:animate-none" />
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
