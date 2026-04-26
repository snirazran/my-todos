'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Pause } from 'lucide-react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { cn } from '@/lib/utils';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useUIStore } from '@/lib/uiStore';

interface Props {
  onClick: () => void;
}

export default function FrogodoroPill({ onClick }: Props) {
  const { 
    isRunning, 
    timeLeft, 
    phase, 
    selectedTaskId, 
    sessionStats, 
    settings 
  } = useFrogodoroStore();

  const { isVisible: isNotificationVisible } = useNotification();
  const { isCinematicActive } = useUIStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const phaseDuration =
    phase === 'focus'
      ? settings.cycleDuration * 60
      : phase === 'shortBreak'
        ? settings.shortBreakDuration * 60
        : settings.longBreakDuration * 60;
  
  const liveElapsed = phaseDuration - timeLeft;

  if (!selectedTaskId || !isRunning) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPhaseStyles = () => {
    if (phase === 'focus') return 'bg-primary text-primary-foreground shadow-primary/20';
    if (phase === 'shortBreak') return 'bg-sky-500 text-white shadow-sky-500/20';
    return 'bg-indigo-500 text-white shadow-indigo-500/20';
  };

  const getTargetBottom = () => {
    const base = 'env(safe-area-inset-bottom)';
    if (isNotificationVisible) return `calc(${base} + 264px)`;
    if (isCinematicActive) return `calc(${base} + 216px)`;
    return `calc(${base} + 176px)`;
  };

  const targetBottom = getTargetBottom();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, x: '-50%', opacity: 0, bottom: targetBottom }}
        animate={{ 
          y: 0, 
          x: '-50%', 
          opacity: 1,
          bottom: targetBottom
        }}
        exit={{ y: 100, x: '-50%', opacity: 0 }}
        className="fixed left-1/2 z-[45]"
      >
        <button
          onClick={onClick}
          className={cn(
            "flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-2xl shadow-xl",
            "backdrop-blur-md transition-all active:scale-95 border border-white/10",
            getPhaseStyles()
          )}
        >
          <div className="relative flex items-center justify-center w-7 h-7 rounded-xl bg-white/20">
            {isRunning ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
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
          
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] opacity-80 mb-0.5">
              {phase === 'focus' ? 'Focus' : 'Break'}
            </span>
            <span className="text-sm font-black tabular-nums">
              {formatTime(timeLeft)}
            </span>
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
