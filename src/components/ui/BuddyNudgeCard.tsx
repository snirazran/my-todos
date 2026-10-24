'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useBuddyBonusFlies, useHasBuddy } from '@/hooks/useBuddyState';
import { useNudge } from '@/hooks/useNudge';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
import type { FriendSummary } from '@/lib/friends/indices';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type FrogIndices = React.ComponentProps<typeof Frog>['indices'];

const FROG_W = 110;
const FROG_H = 100;

export function BuddyNudgeCardView({
  indices,
  bonusFlies,
  onOpen,
  onDismiss,
}: {
  indices?: FrogIndices;
  bonusFlies: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-1.5 mt-16 md:mx-4 md:mt-20">
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[98px] flex justify-center">
          <span className="relative flex items-end">
            <span className="-mr-4">
              <Frog width={FROG_W} height={FROG_H} indices={indices} paused />
            </span>
            <span className="-ml-4 -scale-x-100">
              <Frog width={FROG_W} height={FROG_H} paused />
            </span>
            <span className="buddy-nudge-fly absolute left-1/2 top-[26px] -ml-[14px]">
              <Fly size={28} y={-1} paused interactive={false} />
            </span>
          </span>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-card px-5 pb-4 pt-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05),0_14px_30px_-22px_rgba(15,23,42,0.35)]">
          <h3 className="text-[17px] font-black leading-tight tracking-tight text-foreground">
            Habits are better together
          </h3>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-balance text-[13.5px] font-semibold leading-snug text-muted-foreground">
            Share a goal with a friend. When you both finish it, you each get{' '}
            <span className="inline-flex translate-y-[3px] items-center gap-0.5 rounded-full bg-amber-100 py-0.5 pl-0.5 pr-2 text-[12.5px] font-black leading-none text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              <span className="grid h-[18px] w-[18px] place-items-center">
                <Fly size={20} y={-2} paused interactive={false} />
              </span>
              +{bonusFlies}
            </span>
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[16px] font-black text-primary-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.16)] transition-[transform,filter] duration-150 active:translate-y-[2px] active:shadow-[0_1px_0_0_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 [@media(hover:hover)]:hover:brightness-105"
          >
            Buddy up
          </button>
        </div>

        <button
          type="button"
          aria-label="Dismiss buddy suggestion"
          onClick={onDismiss}
          className="absolute right-2 top-2 grid h-8 w-8 touch-manipulation place-items-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />
        </button>
      </div>
    </div>
  );
}

export function BuddyNudgeCard() {
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(!!user);
  const hasBuddy = useHasBuddy(!!user);
  const { show, dismiss, engage } = useNudge('home_buddy', {
    enabled: hasBuddy === false,
  });
  const bonusFlies = useBuddyBonusFlies(!!user);
  const [flowOpen, setFlowOpen] = useState(false);

  const { data } = useSWR<{ friends: FriendSummary[] }>(
    user && (show || flowOpen) ? '/api/friends' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const friends = data?.friends ?? [];

  if (!user) return null;

  return (
    <>
      {show && (
        <BuddyNudgeCardView
          indices={indices}
          bonusFlies={bonusFlies}
          onOpen={() => {
            engage();
            setFlowOpen(true);
          }}
          onDismiss={dismiss}
        />
      )}

      <BuddyStartFlow
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        friends={friends}
        indices={indices}
        source="home_card"
      />
    </>
  );
}
