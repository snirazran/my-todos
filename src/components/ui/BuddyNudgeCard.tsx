'use client';

import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
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

const FROG_W = 64;
const FROG_H = 58;

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
    <div className="mx-1.5 mt-3 md:mx-4 md:mt-6">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[20px] border border-border/60 bg-card p-2 pr-11 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors active:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [@media(hover:hover)]:hover:bg-muted/30"
        >
          <span
            aria-hidden
            className="relative h-[88px] w-[110px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-50 dark:from-sky-950/60 dark:via-sky-950/30 dark:to-emerald-950/30"
          >
            <svg
              viewBox="0 0 110 88"
              className="absolute inset-0 h-full w-full"
              fill="none"
            >
              <path
                d="M27 40 C 33 10, 77 10, 83 40"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="2.5 5"
                strokeLinecap="round"
                className="text-emerald-600/40 dark:text-emerald-300/40"
              />
            </svg>
            <span className="absolute inset-x-0 bottom-0 h-[17px] rounded-t-[10px] bg-card/95 shadow-[0_-1px_0_rgba(15,23,42,0.06)]" />
            <span className="absolute -left-1.5 bottom-[7px]">
              <Frog width={FROG_W} height={FROG_H} indices={indices} paused />
            </span>
            <span className="absolute -right-1.5 bottom-[7px] -scale-x-100">
              <Frog width={FROG_W} height={FROG_H} paused />
            </span>
            <span className="buddy-nudge-fly absolute left-1/2 top-[3px] -ml-[13px]">
              <Fly size={26} y={-1} paused interactive={false} />
            </span>
          </span>

          <span className="min-w-0 flex-1 py-1">
            <span className="block text-[15.5px] font-black leading-tight tracking-tight text-foreground md:text-[16px]">
              Share a goal with a friend
            </span>
            <span className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold leading-none text-muted-foreground">
              Both finish
              <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-muted-foreground/40" />
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 py-0.5 pl-0.5 pr-2 font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                <span className="grid h-[18px] w-[18px] place-items-center">
                  <Fly size={20} y={-2} paused interactive={false} />
                </span>
                +{bonusFlies} each
              </span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-black text-primary">
              Pick a friend
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={3}
              />
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Dismiss buddy suggestion"
          onClick={onDismiss}
          className="absolute right-1.5 top-1.5 grid h-8 w-8 touch-manipulation place-items-center rounded-full text-muted-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
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
