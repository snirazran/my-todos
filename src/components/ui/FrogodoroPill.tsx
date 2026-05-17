'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Timer, Pause } from 'lucide-react';
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

  const phaseAccent =
    phase === 'focus'
      ? 'bg-primary text-primary-foreground'
      : 'bg-sky-500 text-white';

  return createPortal(
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'pointer-events-auto w-full md:max-w-md md:mx-auto',
        'flex items-center gap-3 px-4 py-3 rounded-[18px] border border-white/10 shadow-sm backdrop-blur-2xl',
        phaseAccent,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-90 transition-opacity"
      >
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/20 shrink-0">
          {isRunning ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
            >
              <Timer className="w-4 h-4" />
            </motion.div>
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
    </motion.div>,
    portalTarget,
  );
}
