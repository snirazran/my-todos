'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useBuddyBonusFlies } from '@/hooks/useBuddyState';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
import type { FriendSummary } from '@/lib/friends/indices';
import { HOME_CARD_SURFACE } from '@/components/ui/taskSurfaces';
import { PRIMARY_BUTTON } from '@/components/ui/quick-add/kit';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type FrogIndices = React.ComponentProps<typeof Frog>['indices'];

const FROG_W = 110;
const FROG_H = 100;
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

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
    <div className="mx-1.5 mt-[81px] md:mx-4 md:mt-[97px]">
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[103px] z-10 flex justify-center">
          <span className="relative flex items-end">
            <span className="-mr-4">
              <Frog width={FROG_W} height={FROG_H} indices={indices} paused />
            </span>
            <span className="-ml-4 -scale-x-100">
              <Frog width={FROG_W} height={FROG_H} paused />
            </span>
            <span className="absolute left-1/2 top-[26px] -ml-[14px]">
              <Fly size={28} y={-1} paused interactive={false} />
            </span>
          </span>
        </div>

        <div className={`relative overflow-hidden px-5 pb-4 pt-6 text-center ${HOME_CARD_SURFACE}`}>
          <h3 className="text-[17px] font-black leading-tight tracking-tight text-foreground">
            Habits are better together
          </h3>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-balance text-[13.5px] font-semibold leading-snug text-muted-foreground">
            Share a goal with a friend. When you both finish it,{' '}
            <span className="whitespace-nowrap">
              you each get{' '}
              <span className="ml-0.5 inline-flex h-6 -translate-y-px items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 pl-0.5 pr-2.5 align-middle text-[13px] font-black leading-none text-amber-700 ring-1 ring-inset ring-amber-300/50 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/25">
                <span className="-my-1.5 grid h-8 w-8 shrink-0 place-items-center">
                  <Fly size={30} y={-2} paused interactive={false} />
                </span>
                <span className="-ml-1">
                  +{bonusFlies} {bonusFlies === 1 ? 'fly' : 'flies'}
                </span>
              </span>
            </span>
          </p>
          <button
            type="button"
            onClick={onOpen}
            className={`${PRIMARY_BUTTON} mt-4 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2`}
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
  const uid = user?.uid;
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const bonusFlies = useBuddyBonusFlies(!!user);
  const [flowOpen, setFlowOpen] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const key = `frogress.home-buddy.dismissed-until.${uid}`;
    const sync = () => {
      try {
        const until = Number(localStorage.getItem(key));
        setDismissedUntil(Number.isFinite(until) && until > Date.now() ? until : null);
      } catch {
        setDismissedUntil(null);
      }
      setReadyUser(uid);
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [uid]);

  useEffect(() => {
    if (dismissedUntil === null) return;
    const timer = window.setTimeout(() => setDismissedUntil(null), Math.max(0, dismissedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [dismissedUntil]);

  const show = !!uid && readyUser === uid && dismissedUntil === null;
  const dismiss = () => {
    if (!uid) return;
    const until = Date.now() + DISMISS_FOR_MS;
    setDismissedUntil(until);
    try {
      localStorage.setItem(`frogress.home-buddy.dismissed-until.${uid}`, String(until));
    } catch {
      // Keep the dismissal for this session when storage is unavailable.
    }
  };

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
