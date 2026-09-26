'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { useDeepFocusPauseGuard } from '@/hooks/useDeepFocusPauseGuard';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  taskName?: string;
}

const RING_SIZE = 40;
const RING_STROKE = 3.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function phaseSeconds(s: {
  phase: string;
  settings: { focusDuration: number; breakDuration: number };
}) {
  return (
    (s.phase === 'focus' ? s.settings.focusDuration : s.settings.breakDuration) * 60
  );
}

function PillTime() {
  const timeLeft = useFrogodoroStore((s) => s.timeLeft);
  const m = Math.floor(timeLeft / 60);
  const sec = timeLeft % 60;
  return (
    <>
      {m}:{sec.toString().padStart(2, '0')}
    </>
  );
}

function PillRing({ running }: { running: boolean }) {
  const progress = useFrogodoroStore((s) => {
    const total = phaseSeconds(s);
    return total > 0 ? Math.min(1, Math.max(0, (total - s.timeLeft) / total)) : 0;
  });
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center">
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-white/25"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          className={cn(
            'stroke-white',
            running && 'transition-[stroke-dashoffset] duration-1000 ease-linear',
          )}
        />
      </svg>
      <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
        >
          <circle cx="12" cy="13" r="8.5" />
          <line x1="10" y1="2.5" x2="14" y2="2.5" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          className={cn(
            'absolute inset-0 h-4 w-4',
            running && 'animate-[spin_4s_linear_infinite]',
          )}
          style={{ transformOrigin: '50% 54%' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
        >
          <line x1="12" y1="13" x2="12" y2="8" />
        </svg>
      </span>
    </span>
  );
}

export default function FrogodoroPill({ onClick, taskName }: Props) {
  const {
    timerActive,
    isRunning,
    phase,
    selectedTaskId,
    startTimer,
    pauseTimer,
  } = useFrogodoroStore(
    useShallow((s) => ({
      timerActive: s.timerActive,
      isRunning: s.isRunning,
      phase: s.phase,
      selectedTaskId: s.selectedTaskId,
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
    })),
  );

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const { armed: pauseArmed, guardPause } = useDeepFocusPauseGuard();

  useEffect(() => {
    setPortalTarget(document.getElementById('frog-bottom-stack-top'));
  }, []);

  if (!portalTarget || !selectedTaskId || !timerActive) return null;

  const phaseBase =
    phase === 'focus'
      ? 'bg-primary text-primary-foreground dark:bg-green-700 dark:text-white'
      : 'bg-sky-500 text-white dark:bg-sky-700';
  const accentText =
    phase === 'focus' ? 'text-primary dark:text-green-700' : 'text-sky-600 dark:text-sky-700';

  const status = !isRunning
    ? 'Paused'
    : phase === 'focus'
      ? 'Focus'
      : 'On a break';

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) guardPause(pauseTimer);
    else startTimer();
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'pointer-events-auto relative w-full overflow-hidden md:w-[380px] md:self-end',
        'rounded-[20px] border border-white/10 shadow-sm',
        phaseBase,
      )}
    >
      <div className="relative flex items-center gap-3 py-2 pl-2 pr-2.5">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open timer${taskName ? ` for ${taskName}` : ''}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-90"
        >
          <PillRing running={isRunning} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[15px] font-black">
              {taskName || (phase === 'focus' ? 'Focus' : 'Break')}
            </span>
            {pauseArmed ? (
              <span className="text-[12px] font-black text-amber-300">
                Tap again — +1 fly lost
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-bold opacity-80">
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 w-1.5 rounded-full bg-current',
                    isRunning && 'animate-pulse',
                  )}
                />
                {status}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[20px] font-black tabular-nums tracking-tight">
            <PillTime />
          </span>
        </button>

        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={isRunning ? 'Pause' : 'Resume'}
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white shadow-sm transition-transform active:scale-90',
            accentText,
            pauseArmed && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent',
          )}
        >
          {isRunning ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          )}
        </button>
      </div>
    </motion.div>,
    portalTarget,
  );
}
