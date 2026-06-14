'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  taskName?: string;
}

export default function FrogodoroPill({ onClick, taskName }: Props) {
  const {
    timerActive,
    isRunning,
    timeLeft,
    phase,
    selectedTaskId,
    settings,
    phaseElapsed,
    startTimer,
    pauseTimer,
    stopTimer,
    completePhase,
  } = useFrogodoroStore();

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('frog-bottom-stack-top'));
  }, []);

  if (!portalTarget || !selectedTaskId || !timerActive) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Same green/blue as the rest of the Frogodoro UI. The base is the phase
  // colour; the elapsed fill is a darker shade of that same colour and grows
  // left→right as the phase passes.
  const phaseBase =
    phase === 'focus'
      ? 'bg-primary text-primary-foreground'
      : 'bg-sky-500 dark:bg-sky-600 text-white';
  const phaseFill = 'bg-black/20';

  const phaseDuration =
    (phase === 'focus' ? settings.focusDuration : settings.breakDuration) * 60;
  const progressPercent =
    phaseDuration > 0
      ? Math.min(100, Math.max(0, ((phaseDuration - timeLeft) / phaseDuration) * 100))
      : 0;

  // Play/pause toggle and stop — GlobalTimer flushes unsaved time on the
  // isRunning→false transition, so these only need the store actions.
  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) pauseTimer();
    else startTimer();
  };
  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopTimer();
  };
  // Skip to the next phase. completePhase advances state immediately, so we must
  // flush the unsaved elapsed time to the DB *before* calling it (GlobalTimer's
  // pause-flush can't, since the phase/timeLeft have already moved on).
  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phaseDuration =
      (phase === 'focus' ? settings.focusDuration : settings.breakDuration) * 60;
    const liveElapsed = phaseDuration - timeLeft;
    const unsaved = Math.max(0, liveElapsed - phaseElapsed);
    if (selectedTaskId && unsaved > 0) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const session = {
        date: today,
        focusTime: phase === 'focus' ? unsaved : 0,
        breakTime: phase === 'break' ? unsaved : 0,
      };
      window.dispatchEvent(
        new CustomEvent('frogodoro-progress-saved', {
          detail: { taskId: selectedTaskId, session },
        }),
      );
      void fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, timezone }),
      }).catch(() => {});
    }
    completePhase(false, liveElapsed);
  };

  return createPortal(
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'pointer-events-auto relative w-full overflow-hidden md:w-[380px] md:self-end',
        'rounded-[18px] border border-white/10 shadow-sm backdrop-blur-2xl',
        phaseBase,
      )}
    >
      {/* Progress fill — grows left→right as the phase elapses */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 z-0',
          phaseFill,
          isRunning ? 'transition-[width] duration-1000 ease-linear' : '',
        )}
        style={{ width: `${progressPercent}%` }}
      />

      <div className="relative z-10 flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-90 transition-opacity"
      >
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/20 shrink-0">
          {isRunning ? (
            <span className="relative flex h-4 w-4 items-center justify-center">
              {/* Static clock face */}
              <svg
                viewBox="0 0 24 24"
                className="absolute inset-0 h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="9" />
                {/* Top stem to keep the Timer silhouette */}
                <line x1="10" y1="2" x2="14" y2="2" strokeLinecap="round" />
              </svg>
              {/* Only the hand spins */}
              <motion.svg
                viewBox="0 0 24 24"
                className="absolute inset-0 h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
              >
                <line x1="12" y1="12" x2="12" y2="6.5" />
              </motion.svg>
            </span>
          ) : (
            <Pause className="w-4 h-4 fill-current" />
          )}

          {isRunning && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
          )}
        </div>

        <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] opacity-80">
              {isRunning ? (phase === 'focus' ? 'Focus' : 'Break') : 'Paused'}
            </span>
            {taskName && (
              <span className="text-sm font-bold truncate opacity-95">
                {taskName}
              </span>
            )}
          </div>
          <span className="text-base font-black tabular-nums shrink-0">
            {formatTime(timeLeft)}
          </span>
        </div>
      </button>

      {/* Quick controls — stop · play/pause · skip-to-next-phase (far right) */}
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={handleStop}
          aria-label="Stop"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 active:scale-95"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={isRunning ? 'Pause' : 'Resume'}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 active:scale-95"
        >
          {isRunning ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          aria-label="Skip to next phase"
          title="Skip to next phase"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 active:scale-95"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
      </div>
      </div>
    </motion.div>,
    portalTarget,
  );
}
