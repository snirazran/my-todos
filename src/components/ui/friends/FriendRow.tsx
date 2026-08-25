'use client';

import React from 'react';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { hapticTick } from '@/lib/haptics';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { rarityRank } from '@/lib/skins/catalog';
import { contributionFrom, type FriendSummary } from '@/lib/friends/indices';
import { CheerButton } from '@/components/ui/friends/CheerButton';
import { LookLovedChip } from '@/components/ui/LookReactions';

export type FriendRowEntry = FriendSummary & { isYou?: boolean };

const MEDAL = [
  'bg-amber-400 text-amber-950',
  'bg-slate-300 text-slate-800',
  'bg-amber-700 text-amber-50',
];

export function FriendRow({
  entry,
  onOpen,
  rank,
  buddyInvites = 0,
  paused = false,
  animate = false,
}: {
  entry: FriendRowEntry;
  onOpen: () => void;
  /** Set only in ranking mode; drives the podium medal. */
  rank?: number;
  buddyInvites?: number;
  paused?: boolean;
  /** Live Rive frog instead of a stamped frame. Reserved for the top row. */
  animate?: boolean;
}) {
  const shared = entry.givesYou ?? contributionFrom(entry.fliesToday);
  const look = entry.flexRarity ? RARITY_CONFIG[entry.flexRarity] : null;
  const flex =
    entry.flexRarity && rarityRank[entry.flexRarity] >= rarityRank.epic
      ? RARITY_CONFIG[entry.flexRarity]
      : null;
  const medal =
    entry.fliesToday > 0 && rank && rank <= 3 ? MEDAL[rank - 1] : null;
  const hasLook =
    (entry.equippedItems?.length ?? 0) > 0 || !!entry.backgroundRarity;

  return (
    <li
      className={cn(
        'relative flex items-center gap-1 rounded-2xl border bg-card pr-2 transition-[border-color,box-shadow]',
        flex
          ? cn('border-2', flex.border, 'shadow-md', flex.glow)
          : 'border-border/60 hover:border-[#4f9149]/40',
      )}
    >
      {buddyInvites > 0 && (
        <span className="absolute -left-1 -top-1 z-20 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-background bg-rose-500 px-1 text-[10px] font-black text-white">
          {buddyInvites > 9 ? '9+' : buddyInvites}
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          hapticTick();
          onOpen();
        }}
        className="flex min-w-0 flex-1 touch-manipulation items-center gap-1.5 rounded-2xl py-1.5 pl-1 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[360px]:gap-2.5 min-[360px]:pl-1.5"
      >
        <div className="relative flex aspect-[6/5] w-[30%] min-w-[78px] max-w-[124px] shrink-0 items-end justify-center self-center overflow-hidden">
          {animate ? (
            <Frog
              className="translate-y-[15%]"
              width="145%"
              height="145%"
              indices={entry.indices}
              paused={paused}
            />
          ) : (
            <FrogSnapshot
              className="translate-y-[15%]"
              width="145%"
              height="145%"
              indices={entry.indices}
              visualOffsetY={0}
            />
          )}
          {medal && (
            <span
              className={cn(
                'absolute left-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[11px] font-black shadow-sm',
                medal,
              )}
            >
              {rank}
            </span>
          )}
          <PremiumFrogAura show={!!entry.premium} compact flySize={28} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-sm font-bold leading-tight tracking-tight text-foreground sm:text-[15px]">
            <span
              className={cn('truncate', entry.premium && 'plus-name-shimmer')}
            >
              {entry.name || entry.frogName}
            </span>
            {entry.isYou && (
              <span className="shrink-0 rounded-full bg-[#4f9149]/12 px-1.5 py-0.5 text-[10px] font-black text-[#4f9149]">
                You
              </span>
            )}
            {entry.premium && (
              <Icon
                name="frogPlus"
                label="Frogress Plus"
                className="h-5 w-5 shrink-0 min-[360px]:h-6 min-[360px]:w-6"
              />
            )}
          </p>

          {entry.focusing ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Focusing now
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
              {entry.isYou
                ? `${entry.fliesToday} caught today`
                : shared > 0
                  ? `Sent you ${shared} ${shared === 1 ? 'fly' : 'flies'}`
                  : (entry.tasksToday ?? 0) > 0
                    ? `${entry.tasksToday} done today`
                    : 'Nothing yet today'}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {entry.isYou && <LookLovedChip />}
            {(entry.streak ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-orange-500">
                <Flame className="h-3 w-3 fill-orange-400" />
                {entry.streak}
              </span>
            )}
            {look && hasLook && (
              <span
                className={cn(
                  'max-w-full truncate whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-black',
                  look.bg,
                  look.text,
                )}
              >
                {look.label}
              </span>
            )}
          </div>
        </div>

        <span
          className={cn(
            'flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-1',
            entry.fliesToday > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className={cn(entry.fliesToday <= 0 && 'grayscale opacity-60')}>
            <Fly size={20} y={-2} interactive={false} paused={paused} />
          </span>
          <span className="text-base font-black tabular-nums leading-none">
            {entry.fliesToday}
          </span>
        </span>
      </button>

      {!entry.isYou && <CheerButton toUserId={entry.userId} />}
    </li>
  );
}
