'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Lock, Target } from 'lucide-react';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import Fly from '@/components/ui/fly';

interface GiftInfoPopupProps {
  show: boolean;
  onClose: () => void;
  slot: {
    status: string;
    target: number;
    tasksLeft: number;
    neededToUnlock: number;
  } | null;
  onAddTask: () => void;
}

export function GiftInfoPopup({
  show,
  onClose,
  slot,
  onAddTask,
}: GiftInfoPopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

  if (!mounted || !slot) return null;

  const isLocked = slot.status === 'LOCKED';
  const isPending = slot.status === 'PENDING';
  const progressPercent = isPending
    ? ((slot.target - slot.tasksLeft) / slot.target) * 100
    : 0;

  return createPortal(
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[999] bg-background/80 backdrop-blur-[2px]"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{
              type: 'tween',
              ease: [0.32, 0.72, 0, 1],
              duration: 0.4,
            }}
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none bottom-0 will-change-transform"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[520px] pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-[28px] bg-popover/95 backdrop-blur-2xl ring-1 ring-border/80 shadow-[0_24px_48px_rgba(15,23,42,0.25)] p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                      {isLocked ? (
                        <Lock
                          className="w-5 h-5 text-primary"
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Target
                          className="w-5 h-5 text-primary"
                          strokeWidth={2.5}
                        />
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-black tracking-tight text-foreground">
                        {isLocked ? 'Gift Locked' : 'Keep Going!'}
                      </h2>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        {isLocked
                          ? 'Add more tasks'
                          : `${slot.tasksLeft} task${slot.tasksLeft > 1 ? 's' : ''} to go`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 bg-muted/50 hover:bg-muted rounded-xl transition-all text-muted-foreground hover:text-foreground active:scale-90 ring-1 ring-border/50"
                  >
                    <X className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Gift Visual */}
                <div className="flex items-center justify-center py-0 mb-2">
                  <GiftRive width={220} height={220} isMilestone={isLocked} />
                </div>

                {/* Content Card */}
                <div className="p-3 mb-3 bg-muted/30 rounded-2xl ring-1 ring-border/50">
                  {isLocked && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Tasks Needed
                        </span>
                        <div className="flex items-center gap-2">
                          <Plus
                            className="w-4 h-4 text-primary"
                            strokeWidth={3}
                          />
                          <span className="text-3xl font-black text-primary tabular-nums">
                            {slot.neededToUnlock}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Add{' '}
                        <span className="font-bold text-foreground">
                          {slot.neededToUnlock}
                        </span>{' '}
                        more task{slot.neededToUnlock > 1 ? 's' : ''} to your
                        list to unlock this gift slot.
                      </p>
                    </div>
                  )}

                  {isPending && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Your Progress
                        </span>
                        <span className="text-lg font-black text-foreground tabular-nums">
                          {slot.target - slot.tasksLeft} / {slot.target}
                        </span>
                      </div>
                      <div className="relative w-full h-2.5 bg-muted rounded-full overflow-hidden ring-1 ring-border/40">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full bg-primary relative"
                        >
                          {progressPercent > 50 && (
                            <div
                              className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.3),transparent)] animate-shimmer"
                              style={{ backgroundSize: '200% 100%' }}
                            />
                          )}
                        </motion.div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Complete{' '}
                        <span className="font-bold text-foreground">
                          {slot.tasksLeft}
                        </span>{' '}
                        more task{slot.tasksLeft > 1 ? 's' : ''} to unlock this
                        gift!
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      onAddTask();
                      onClose();
                    }}
                    className="relative h-12 rounded-full text-[15px] font-bold overflow-hidden transition-all bg-primary text-primary-foreground shadow-sm ring-1 ring-white/20 hover:brightness-105 active:scale-[0.985]"
                  >
                    <span className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/25 to-transparent" />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Add Task</span>
                      <Fly size={24} x={-1} y={-3} />
                    </span>
                  </button>
                  <button
                    onClick={onClose}
                    className="h-12 rounded-full text-[15px] font-semibold transition-all bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.985] ring-1 ring-border"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <X className="w-4 h-4" />
                      Cancel
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
