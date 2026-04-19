'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Flame, Gift, Loader2, Sparkles, X } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { MonthProgress } from './MonthProgress';
import { useAuth } from '@/components/auth/AuthContext';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { BaseSheet } from '@/components/ui/BaseSheet';

interface DailyStatusResponse {
  dailyRewards: {
    lastClaimDate: string | null;
    claimedDays: number[];
    month: string;
    streak: number;
  };
  isPremium: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function DailyRewardPopup({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: statusData, mutate: mutateStatus } =
    useSWR<DailyStatusResponse>(
      user
        ? `/api/daily-reward/status?timezone=${encodeURIComponent(userTimezone)}`
        : null,
      fetcher,
    );

  const [claiming, setClaiming] = useState(false);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);
  const currentDay = new Date().getDate();

  const handleClaim = async (day: number) => {
    if (claiming || !user) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/daily-reward/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, timezone: userTimezone }),
      });
      const data = await res.json();
      if (data.success) {
        await mutateStatus();
        mutateInventoryCaches();
        setTimeout(() => {
          onClose();
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

  if (!show || !statusData) return null;

  return (
    <>
      <BaseSheet
        open={show}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        className="h-[92vh] sm:h-[88vh] sm:max-w-[980px] bg-background"
        zIndex={1060}
      >
        {({ isDesktop, dragControls }) => (
          <div className="relative flex h-full flex-col">
            <div
              onPointerDown={(e) => !isDesktop && dragControls.start(e)}
              className="px-4 py-4 border-b border-border/50 md:px-6 shrink-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 shrink-0">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black tracking-tight text-foreground uppercase leading-none">
                      Daily Rewards
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                        Day {currentDay}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        <Flame className="w-3 h-3 text-primary" />
                        {statusData.dailyRewards.streak}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        <Crown className="w-3 h-3" />
                        {statusData.isPremium ? 'Active' : 'Locked'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95"
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 px-4 pt-3 md:px-6">
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

            {claiming && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md">
                <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 shadow-xl">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm font-black uppercase tracking-wide text-foreground">
                    Claiming
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </BaseSheet>

      {/* Premium Upsell Popup */}
      {showPremiumPopup &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div
              onClick={() => setShowPremiumPopup(false)}
              className="absolute inset-0"
            />
            <div className="dark relative bg-card border border-border w-full max-w-md p-0 rounded-[32px] shadow-2xl overflow-hidden ring-1 ring-white/10">
              <div
                className="h-44 relative overflow-hidden flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(135deg, #a16207 0%, #92400e 60%, #78350f 100%)',
                }}
              >
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background:
                      'radial-gradient(ellipse at top, rgba(253,230,138,0.4) 0%, transparent 70%)',
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="bg-black/25 backdrop-blur-md p-4 rounded-[24px] ring-1 ring-white/20 shadow-xl">
                    <Sparkles className="w-8 h-8 text-amber-300" />
                  </div>
                  <div className="px-3 py-1 rounded-full bg-black/20 border border-amber-300/30">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                      Pro Feature
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-8 pt-5">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-black tracking-tight mb-2 text-foreground">
                    Unlock Premium Rewards
                  </h3>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                    Get exclusive daily rewards including rare skins and bonus
                    flies.
                  </p>
                </div>
                <div className="space-y-3 mb-7">
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
                  ].map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/30"
                    >
                      <div className="bg-amber-500/15 p-1.5 rounded-full ring-1 ring-amber-500/25">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground leading-none mb-0.5">
                          {f.text}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.sub}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-4 rounded-[20px] font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{
                      background:
                        'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                      color: '#fef3c7',
                      boxShadow: '0 8px 24px rgba(217,119,6,0.4)',
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Upgrade Now
                  </button>
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-3 rounded-[20px] text-xs font-bold text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/20"
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
