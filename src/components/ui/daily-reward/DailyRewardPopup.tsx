'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Loader2, Sparkles, Gift, Lock } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { MonthProgress } from './MonthProgress';
import GiftBoxOpening from '../gift-box/GiftBoxOpening'; // Maybe reuse?
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';

// Type definition for API response
interface DailyStatusResponse {
  dailyRewards: {
    lastClaimDate: string | null;
    claimedDays: number[];
    month: string;
    streak: number;
  };
  isPremium: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function DailyRewardPopup({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const {
    data: statusData,
    isLoading,
    mutate: mutateStatus,
  } = useSWR<DailyStatusResponse>(
    user ? '/api/daily-reward/status' : null,
    fetcher,
  );

  const [claiming, setClaiming] = useState(false);
  const [justClaimedReward, setJustClaimedReward] = useState<any>(null);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);

  const currentDay = new Date().getDate();
  const dragControls = useDragControls();

  // Handler
  const handleClaim = async (day: number) => {
    if (claiming || !user) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/daily-reward/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      const data = await res.json();

      if (data.success) {
        await mutateStatus();
        mutate('/api/skins/inventory');
        setJustClaimedReward(data.rewards);
        // Auto-close after claiming, then refresh fly balance
        setTimeout(() => {
          onClose();
          // Refresh fly balance in task data after popup is closed
          mutate(
            (key: string) =>
              typeof key === 'string' && key.startsWith('/api/tasks'),
            undefined,
            { revalidate: true },
          );
        }, 1200);
      }
    } catch (e) {
      console.error('Claim failed', e);
    } finally {
      setClaiming(false);
    }
  };

  /* ---------------- Responsive & Animation Logic ---------------- */
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

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

  // Lock body scroll when popup is open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [show]);

  if (!show || !statusData) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[1060] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />

            {/* Card / Sheet */}
            <motion.div
              variants={isDesktop ? desktopVariants : mobileVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 500) {
                  onClose();
                }
              }}
              className={cn(
                'relative w-full bg-background shadow-2xl border-t sm:border border-border/50 overflow-hidden flex flex-col pointer-events-auto',
                isDesktop
                  ? 'max-w-4xl rounded-[40px] max-h-[85vh]'
                  : 'h-[90vh] rounded-t-[32px]',
              )}
            >
              {/* Drag Handle (Mobile Only) — invisible hit area, no visible pill */}
              {!isDesktop && (
                <div
                  className="absolute top-0 left-0 right-0 h-10 z-50 touch-none"
                  onPointerDown={(e) => dragControls.start(e)}
                />
              )}

              {/* Header */}
              <div className="p-4 md:p-8 text-center space-y-1 relative bg-gradient-to-b from-primary/5 to-transparent shrink-0">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors opacity-70 hover:opacity-100 z-[60]"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Gift className="w-6 h-6 text-primary" />
                </div>

                <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                  Daily Rewards
                </h2>
                <p className="text-muted-foreground font-medium">
                  Claim free gifts every day!
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <MonthProgress
                  progress={{
                    ...statusData.dailyRewards,
                    lastClaimDate: statusData.dailyRewards.lastClaimDate
                      ? new Date(statusData.dailyRewards.lastClaimDate)
                      : null,
                  }}
                  currentDay={currentDay}
                  isPremium={statusData.isPremium}
                  onClaim={handleClaim}
                  onGoPremium={() => setShowPremiumPopup(true)}
                />
              </div>

              {/* Footer / Status - Removed */}

              {/* Loading Overlay */}
              {claiming && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body,
      )}

      {/* Premium Upsell Popup */}
      {showPremiumPopup &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div
              onClick={() => setShowPremiumPopup(false)}
              className="absolute inset-0"
            />
            <div className="relative bg-card border border-border w-full max-w-md p-0 rounded-[32px] shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-white/10">
              {/* Decorative Header */}
              <div className="h-40 bg-gradient-to-br from-primary/30 via-primary/10 to-background relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/30 rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                <div className="absolute -left-10 bottom-0 w-32 h-32 bg-secondary/30 rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="bg-background/80 backdrop-blur-md p-4 rounded-[24px] ring-1 ring-white/20 shadow-xl mb-3 shadow-primary/10">
                    <Sparkles className="w-8 h-8 text-primary fill-primary/20" />
                  </div>
                  <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      Pro Feature
                    </span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-8 pt-4">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-black tracking-tight mb-3 text-foreground">
                    Unlock Premium Rewards
                  </h3>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed px-2">
                    Get exclusive premium rewards every day, including rare
                    skins and bonus flies.
                  </p>
                </div>

                {/* Features */}
                <div className="space-y-4 mb-8">
                  {[
                    {
                      text: 'Daily Premium Rewards',
                      sub: 'Exclusive items every day',
                    },
                    {
                      text: 'Rare Skins & Accessories',
                      sub: 'Stand out from the crowd',
                    },
                    { text: 'Bonus Flies', sub: 'Extra currency every day' },
                  ].map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 p-3 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
                    >
                      <div className="mt-0.5 bg-primary/10 p-1.5 rounded-full ring-1 ring-primary/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-foreground leading-none mb-1">
                          {feature.text}
                        </p>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {feature.sub}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-4 rounded-[20px] font-bold bg-primary text-primary-foreground shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                  >
                    <Sparkles className="w-4 h-4 fill-primary-foreground/20 group-hover:animate-pulse" />
                    <span>Upgrade Now</span>
                  </button>
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-3 rounded-[20px] font-bold text-xs text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/30"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
