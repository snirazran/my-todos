'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import Fly from '@/components/ui/fly';
import type { Claimable, Trackable } from '@/lib/questClaims';

type HomeView = {
  claimables?: Claimable[];
  trackables?: Trackable[];
};

function questHomeKey() {
  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  return `/api/quests?view=home&timezone=${encodeURIComponent(tz)}`;
}

/**
 * The focus-session payoff, rendered inside the colored Done card: the user's
 * frog celebrating, the minutes this session earned, the deep-focus bonus fly,
 * and the focus quests those minutes visibly filled.
 */
export function FocusCelebration({
  seconds,
  bonusFly = false,
  fliesCaught = 0,
  compact = false,
}: {
  seconds: number;
  bonusFly?: boolean;
  fliesCaught?: number;
  compact?: boolean;
}) {
  const { indices } = useWardrobeIndices(true);
  const { data } = useSWR<HomeView>(questHomeKey(), bootstrapFetcher, {
    revalidateOnFocus: false,
  });

  const minutes = Math.floor(seconds / 60);
  const minutesLabel =
    minutes >= 1 ? `+${minutes} min focused` : 'Focus logged';

  const focusQuests = useMemo(() => {
    const trackables = (data?.trackables ?? []).filter(
      (t) => t.objectiveType === 'focus_minutes' && !t.needsFocusTags,
    );
    trackables.sort((a, b) => {
      const ra = a.progress / Math.max(1, a.target);
      const rb = b.progress / Math.max(1, b.target);
      return rb - ra;
    });
    return trackables.slice(0, compact ? 1 : 2);
  }, [data?.trackables, compact]);

  const focusClaimable = useMemo(
    () =>
      (data?.claimables ?? []).find((c) =>
        (c.objectiveLabel ?? '').startsWith('Focus for'),
      ) ?? null,
    [data?.claimables],
  );

  const frogSize = compact ? 72 : 96;

  return (
    <div className="relative flex flex-col items-center">
      {/* Burst dots behind the frog */}
      <div aria-hidden className="pointer-events-none absolute top-6 left-1/2">
        {[...Array(8)].map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
              animate={{
                x: Math.cos(angle) * (compact ? 44 : 60),
                y: Math.sin(angle) * (compact ? 34 : 46),
                opacity: 0,
                scale: 0.4,
              }}
              transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }}
              className="absolute h-2 w-2 rounded-full bg-white/80"
            />
          );
        })}
      </div>

      <motion.div
        initial={{ scale: 0.6, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.05 }}
      >
        <FrogSnapshot
          indices={indices}
          width={frogSize}
          height={frogSize * 1.05}
          visualOffsetY={0}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={`${compact ? 'text-lg' : 'text-2xl'} font-black tracking-tight text-white drop-shadow`}
      >
        {minutesLabel}
      </motion.p>

      {(fliesCaught > 0 || bonusFly) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 300, damping: 16 }}
          className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5"
        >
          {fliesCaught > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
              <Fly size={16} interactive={false} paused />
              +{fliesCaught} {fliesCaught === 1 ? 'fly' : 'flies'} caught
            </span>
          )}
          {bonusFly && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
              <Fly size={16} interactive={false} paused />
              +1 fly · Deep focus
            </span>
          )}
        </motion.div>
      )}

      {focusClaimable && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-amber-300/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-900 shadow"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Quest reward ready!
        </motion.div>
      )}

      {focusQuests.length > 0 && (
        <div className={`mt-3 w-full space-y-2 ${compact ? '' : 'px-2'}`}>
          {focusQuests.map((quest) => {
            const target = Math.max(1, quest.target);
            const to = Math.min(1, quest.progress / target);
            const from = Math.min(
              to,
              Math.max(0, (quest.progress - Math.max(1, minutes)) / target),
            );
            return (
              <div key={quest.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p className="truncate text-[11px] font-bold text-white/90">
                    {quest.objectiveLabel}
                  </p>
                  <p className="shrink-0 text-[11px] font-black tabular-nums text-white">
                    {Math.min(quest.progress, target)}/{target}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/25">
                  <motion.div
                    initial={{ width: `${from * 100}%` }}
                    animate={{ width: `${to * 100}%` }}
                    transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-white/90"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
