'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { useUIStore } from '@/lib/uiStore';
import { useDeepFocusPauseGuard } from '@/hooks/useDeepFocusPauseGuard';

/**
 * Compact circular timer for pages that don't host the full Frogodoro UI
 * (Quests, Wardrobe, …). Sits at the side, shows the countdown with a progress
 * ring, and expands to stop / pause / skip controls on tap.
 */
export default function CircularTimer() {
  const {
    timerActive,
    isRunning,
    timeLeft,
    endTime,
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
  const [expanded, setExpanded] = useState(false);
  const { armed: pauseArmed, guardPause } = useDeepFocusPauseGuard();
  const wardrobeDockVisible = useUIStore(
    (s) => s.isWardrobeStuck && s.wardrobeTab === 'inventory',
  );

  useEffect(() => setPortalTarget(document.body), []);
  // Collapse the controls whenever there's no active session.
  useEffect(() => {
    if (!timerActive) setExpanded(false);
  }, [timerActive]);

  if (!portalTarget || !selectedTaskId || !timerActive) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const phaseDuration =
    (phase === 'focus' ? settings.focusDuration : settings.breakDuration) * 60;
  const progress =
    phaseDuration > 0
      ? Math.min(1, Math.max(0, (phaseDuration - timeLeft) / phaseDuration))
      : 0;

  const fillColor =
    phase === 'focus'
      ? 'bg-primary text-primary-foreground dark:bg-green-700 dark:text-white'
      : 'bg-sky-500 text-white dark:bg-sky-700';

  // Ring geometry
  const R = 28;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - progress);

  const persistUnsaved = () => {
    const liveElapsed =
      isRunning && endTime
        ? phaseDuration - Math.max(0, Math.round((endTime - Date.now()) / 1000))
        : phaseDuration - timeLeft;
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
    return liveElapsed;
  };

  const handlePlayPause = () => {
    if (isRunning) guardPause(pauseTimer);
    else startTimer();
  };
  const handleStop = () => {
    persistUnsaved();
    stopTimer();
  };
  const handleSkip = () => {
    const liveElapsed = persistUnsaved();
    const autoStart = phase === 'focus' ? settings.autoStartBreaks : false;
    completePhase(autoStart, liveElapsed, false);
  };

  const ctrlBtn =
    'flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-border/60 transition-transform active:scale-90';
  const dockClass = wardrobeDockVisible
    ? 'right-5 bottom-[calc(env(safe-area-inset-bottom)+184px)] md:right-[max(calc(1rem+4px),calc((100vw-48rem)/2-72px-0.75rem+4px))] md:bottom-[120px]'
    : 'right-3 bottom-[calc(env(safe-area-inset-bottom)+96px)]';

  return createPortal(
    <>
      {/* Click-outside catcher — closes the expanded controls. */}
      {expanded && (
        <div
          className="fixed inset-0 z-[1309]"
          onClick={() => setExpanded(false)}
          aria-hidden
        />
      )}
      <div className={`fixed ${dockClass} z-[1310] flex flex-col items-center gap-2`}>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="flex flex-col items-center gap-2"
          >
            <button type="button" aria-label="Stop" onClick={handleStop} className={ctrlBtn}>
              <Square className="h-4 w-4 fill-current" />
            </button>
            <button type="button" aria-label="Skip" onClick={handleSkip} className={ctrlBtn}>
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
            <div className="relative">
              {pauseArmed && (
                <span className="absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-black text-white shadow-lg">
                  Tap again — +1 fly lost
                </span>
              )}
              <button
                type="button"
                aria-label={isRunning ? 'Pause' : 'Resume'}
                onClick={handlePlayPause}
                className={`${ctrlBtn} ${pauseArmed ? 'ring-2 ring-amber-500' : ''}`}
              >
                {isRunning ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setExpanded((v) => !v)}
        aria-label="Timer"
        className={`relative flex h-16 w-16 items-center justify-center rounded-full shadow-xl ${fillColor}`}
      >
        {/* Progress ring */}
        <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="4" className="stroke-white/25" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className="stroke-white"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            style={isRunning ? { transition: 'stroke-dashoffset 1s linear' } : undefined}
          />
        </svg>

        <span className="relative text-[15px] font-black tabular-nums leading-none">
          {formatTime(timeLeft)}
        </span>
      </motion.button>
      </div>
    </>,
    portalTarget,
  );
}
