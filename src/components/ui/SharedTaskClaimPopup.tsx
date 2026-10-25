'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { useBuddyBonusFlies } from '@/hooks/useBuddyState';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';

export function SharedTaskClaimPopup({
  text,
  partnerName,
  onClose,
}: {
  text: string;
  partnerName: string;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const bonusFlies = useBuddyBonusFlies();
  const { entered, markEntered } = useEntrance(true);

  useEffect(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    confetti({
      particleCount: 90,
      spread: 80,
      startVelocity: 42,
      origin: rect
        ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: 0.45 }
        : { y: 0.45 },
      zIndex: 99999,
      colors: ['#447d3f', '#8fc36d', '#ffd166', '#ffffff'],
    });
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="shared-task-claim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[10002] flex items-end justify-center bg-[#447d3f]/95 backdrop-blur-sm p-0 sm:items-center sm:p-5"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onAnimationComplete={markEntered}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-none rounded-t-[28px] bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-8 text-center sm:max-w-md sm:rounded-[28px]"
        >
          <SheetEnteredContext.Provider value={entered}>
            <div className="mx-auto mb-3 flex h-24 w-40 items-end justify-center">
              <div className="relative z-10 translate-x-4">
                <Frog width={132} height={118} paused arrive="pop" />
              </div>
              <div className="relative z-0 -ml-10 -translate-x-2 scale-90">
                <Frog width={132} height={118} paused arrive="pop" arriveDelay={140} />
              </div>
              <span className="absolute translate-y-1">
                <Fly size={28} y={-3} paused />
              </span>
            </div>
          </SheetEnteredContext.Provider>

          <h2 className="text-xl font-black tracking-tight text-foreground">
            You&apos;re goal buddies with {partnerName}!
          </h2>
          <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
            You&apos;re now sharing a goal:
          </p>
          <div className="mx-auto mt-3 w-full rounded-2xl border border-[#447d3f]/20 bg-[#447d3f]/[0.07] px-4 py-3">
            <p className="truncate text-base font-black tracking-tight text-foreground">
              {text}
            </p>
          </div>
          <p className="mt-3 text-[13px] font-medium text-muted-foreground">
            Finish it on the same day and you each earn {bonusFlies} bonus
            flies.
          </p>

          <button
            ref={btnRef}
            type="button"
            onClick={onClose}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#447d3f] py-3.5 text-base font-black tracking-tight text-white shadow-[0_4px_0_#2c511a] transition-all active:translate-y-0.5 active:shadow-none"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            Let&apos;s go
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
