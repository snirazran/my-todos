'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  X,
  Gift,
  Check,
  Loader2,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';
import { mutate as globalMutate } from 'swr';
import { cn } from '@/lib/utils';
import { GiftRive } from './gift-box/GiftBox';
import Fly from './fly';
import { useProgressLogic, type ProgressSlot } from '@/hooks/useProgressLogic';
import { useAuth } from '@/components/auth/AuthContext';

interface GiftHubPopupProps {
  show: boolean;
  onClose: () => void;
  done: number;
  total: number;
  giftsClaimed: number;
  flyBalance: number;
  onAddTask: () => void;
  onMutateToday: () => void;
  isGuest?: boolean;
  onOpenDailyReward?: () => void;
}

export function GiftHubPopup({
  show,
  onClose,
  done,
  total,
  giftsClaimed,
  flyBalance,
  onAddTask,
  onMutateToday,
  isGuest,
  onOpenDailyReward,
}: GiftHubPopupProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [optimisticExtraClaimed, setOptimisticExtraClaimed] = useState(0);
  const dragControls = useDragControls();

  const slots = useProgressLogic(
    done,
    total,
    giftsClaimed + optimisticExtraClaimed,
  );
  const allClaimed = slots.every((slot) => slot.status === 'CLAIMED');
  const hasClaimedDaily =
    slots[0]?.status !== 'CLAIMED' && giftsClaimed > 0;

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setOptimisticExtraClaimed(0);
  }, [giftsClaimed]);

  const handleClaimGift = async () => {
    if (claiming || !user) return;
    setClaiming(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_gift', timezone: tz }),
      });
      if (!res.ok) return;

      setOptimisticExtraClaimed((prev) => prev + 1);
      onMutateToday();
      globalMutate('/api/skins/inventory');
    } catch (e) {
      console.error(e);
    } finally {
      setClaiming(false);
    }
  };

  if (!mounted) return null;

  const mobileVariants = {
    initial: { y: '100%', opacity: 0, scale: 0.96 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: '100%', opacity: 0, scale: 0.96 },
  };

  const desktopVariants = {
    initial: { opacity: 0, scale: 0.95, y: 0 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 0 },
  };

  return createPortal(
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1050] bg-black/60 backdrop-blur-md"
          />

          <div className="fixed inset-0 z-[1051] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
            <motion.div
              variants={isDesktop ? desktopVariants : mobileVariants}
              initial="initial"
              animate={
                isDesktop
                  ? { ...desktopVariants.animate, x: 0 }
                  : mobileVariants.animate
              }
              exit="exit"
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              dragMomentum={false}
              dragSnapToOrigin
              dragDirectionLock
              onDragEnd={(_e, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 500) onClose();
              }}
              style={{
                touchAction: 'none',
                transform: 'translate3d(0,0,0)',
              }}
              className={cn(
                'pointer-events-auto w-full sm:max-w-[720px] h-[85vh] sm:h-[80vh] flex flex-col bg-background overflow-hidden relative select-none',
                isDesktop && 'shadow-2xl',
                'rounded-t-[32px] sm:rounded-[40px] border-t sm:border border-border/40',
              )}
            >
              {!isDesktop && (
                <div
                  className="absolute top-0 left-0 right-0 h-8 z-50 touch-none flex justify-center items-center"
                  onPointerDown={(e) => dragControls.start(e)}
                />
              )}

              <div
                className={cn(
                  'relative z-20 px-4 py-4 md:px-6 md:py-5 shrink-0 border-b border-border/40',
                  isDesktop
                    ? 'bg-background/50 backdrop-blur-xl'
                    : 'bg-transparent',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                        Gift Center
                      </h2>
                      <p className="hidden md:block text-sm font-medium text-muted-foreground mt-0.5">
                        Earn gift boxes
                      </p>
                    </div>

                    <div className="flex items-center gap-2 py-1 pl-1 pr-3 border rounded-full bg-secondary border-border">
                      <div className="flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 shrink-0">
                        <Fly
                          size={24}
                          className="text-muted-foreground"
                          y={-2}
                        />
                      </div>
                      <span className="text-sm font-black leading-none md:text-lg text-foreground tabular-nums">
                        {flyBalance}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary/80 text-foreground hover:bg-secondary transition-colors active:scale-90"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'flex flex-col flex-1 min-h-0',
                  isDesktop
                    ? 'bg-background/50 backdrop-blur-2xl'
                    : 'bg-transparent',
                )}
              >
                <div
                  className={cn(
                    'flex-1 relative mt-4 overflow-hidden',
                    'rounded-t-[32px] border-t border-border/40',
                    isDesktop ? 'bg-card/40 backdrop-blur-md' : 'bg-card/20',
                    'md:mx-6 md:mb-6 md:rounded-[32px] md:border md:border-border/40 md:shadow-inner',
                  )}
                >
                  <div className="absolute inset-0 overflow-y-auto p-4 md:p-5">
                    <AnimatePresence mode="wait">
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.15 }}
                      >
                        {allClaimed ? (
                          <AllCollectedState />
                        ) : (
                          <>
                            {!hasClaimedDaily && (
                              <button
                                onClick={() => {
                                  onClose();
                                  onOpenDailyReward?.();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 mb-4 rounded-2xl border-l-4 border border-amber-400/60 dark:border-amber-600/40 border-l-amber-400 dark:border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20 transition-all active:scale-[0.99]"
                              >
                                <div className="relative flex-shrink-0">
                                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                                  </span>
                                  <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                                    <CalendarCheck className="w-4.5 h-4.5" />
                                  </div>
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                                    Today's Bonus
                                  </p>
                                  <p className="text-sm font-bold text-foreground leading-tight truncate">
                                    Daily reward available
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-500 flex-shrink-0">
                                  Collect
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </div>
                              </button>
                            )}

                            <div className="space-y-3 mb-4">
                              {slots.map((slot, idx) => (
                                <MilestoneRow
                                  key={idx}
                                  slot={slot}
                                  index={idx}
                                  claiming={claiming}
                                  onClaim={handleClaimGift}
                                  onAddTask={() => {
                                    onAddTask();
                                    onClose();
                                  }}
                                  isGuest={isGuest}
                                />
                              ))}
                            </div>

                            <div className="p-3 rounded-2xl bg-muted/30 ring-1 ring-border/30">
                              <p className="text-xs font-medium text-muted-foreground text-center leading-relaxed">
                                Eat flies to earn gift boxes.
                              </p>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const MILESTONE_LABELS = ['Gift  I', 'Gift  II', 'Gift  III'];

function MilestoneRow({
  slot,
  index,
  claiming,
  onClaim,
  onAddTask,
  isGuest,
}: {
  slot: ProgressSlot;
  index: number;
  claiming: boolean;
  onClaim: () => void;
  onAddTask: () => void;
  isGuest?: boolean;
}) {
  const isClaimed = slot.status === 'CLAIMED';
  const isReady = slot.status === 'READY';
  const isLocked = slot.status === 'LOCKED';
  const isPending = slot.status === 'PENDING';

  return (
    <motion.div
      layout
      className={cn(
        'relative flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all duration-300',
        isClaimed && 'bg-primary/5 border-primary/20',
        isReady &&
          'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/60 shadow-[0_0_24px_rgba(34,197,94,0.10)]',
        isLocked && 'bg-muted/20 border-dashed border-muted-foreground/20',
        isPending && 'bg-card border-border/50',
      )}
    >
      <div
        className={cn(
          'relative flex-shrink-0 w-[68px] h-[68px] flex items-center justify-center rounded-2xl overflow-hidden',
          isClaimed && 'bg-primary/10',
          isReady && 'bg-primary/10 ring-1 ring-primary/25',
          isLocked && 'bg-muted/50',
          isPending && 'bg-muted/30',
        )}
      >
        {isClaimed ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20"
          >
            <Check className="w-5 h-5 text-primary" strokeWidth={3} />
          </motion.div>
        ) : (
          <div className={cn('-translate-y-1', isLocked && 'opacity-35 grayscale')}>
            <GiftRive width={80} height={80} isMilestone={!isReady} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-widest',
              (isClaimed || isReady)
                ? 'text-primary'
                : 'text-muted-foreground/60',
            )}
          >
            {MILESTONE_LABELS[index]}
          </span>
          {!isClaimed && !isReady && (
            <span
              className={cn(
                'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full',
                isPending
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground/50',
              )}
            >
              {slot.target - slot.tasksLeft}/{slot.target}
            </span>
          )}
        </div>

        <p
          className={cn(
            'text-base font-black tracking-tight mb-2',
            isClaimed && 'text-primary/70',
            isReady && 'text-foreground',
            isLocked && 'text-muted-foreground/50',
            isPending && 'text-foreground',
          )}
        >
          {isClaimed ? (
            'Collected!'
          ) : isReady ? (
            'Ready to claim!'
          ) : (
            <>
              Eat{' '}
              <span className={cn(isPending ? 'text-primary' : 'text-muted-foreground/60')}>
                {slot.target}
              </span>{' '}
              flies
            </>
          )}
        </p>

        <div className="relative w-full h-2 bg-muted/60 rounded-full overflow-hidden mb-2.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${isClaimed || isReady ? 100 : slot.percent}%`,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={cn(
              'h-full rounded-full relative',
              isClaimed && 'bg-primary/40',
              isReady && 'bg-primary',
              isLocked && 'bg-muted-foreground/20',
              isPending &&
                (slot.percent > 50
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400'
                  : 'bg-primary'),
            )}
          >
            {isReady && (
              <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
            )}
            {isPending && slot.percent > 50 && (
              <div
                className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.3),transparent)] animate-shimmer"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}
          </motion.div>
        </div>

        {isReady && (
          <button
            onClick={onClaim}
            disabled={claiming || isGuest}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ring-1 ring-white/20 relative overflow-hidden"
          >
            <span className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/20 to-transparent" />
            {claiming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" />
                <span className="relative z-10">Claiming...</span>
              </>
            ) : (
              <>
                <Gift className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">Claim Gift Box</span>
              </>
            )}
          </button>
        )}

        {isLocked && (
          <button
            onClick={onAddTask}
            className="flex items-center gap-1.5 text-xs font-bold text-primary/70 hover:text-primary transition-colors"
          >
            + Add <Fly size={20} y={-2} /> to unlock
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AllCollectedState() {
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    function updateTimer() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      );
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <Check className="w-8 h-8 text-primary" strokeWidth={2.5} />
      </div>
      <h3 className="text-lg font-black text-foreground mb-1">
        All Gifts Collected!
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Come back tomorrow for more rewards
      </p>
      <div className="px-4 py-2.5 rounded-2xl bg-muted/50 ring-1 ring-border/30">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Next gifts in{' '}
        </span>
        <span className="text-primary font-black font-mono">{timeLeft}</span>
      </div>
    </div>
  );
}
