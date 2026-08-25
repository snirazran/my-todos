'use client';

import React from 'react';
import useSWR from 'swr';
import { UserPlus } from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';

type RewardItem = {
  id: string;
  name: string;
  slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
  riveIndex: number;
  icon?: string;
};
type RewardTier = { tier: number; label: string; item?: RewardItem | null };
type GiftOption = { id: string; item?: RewardItem | null };
type InviteConfig = { rewards: RewardTier[]; giftOptions?: GiftOption[] };
type InviteStatus = { claimedCount: number; pendingCount: number };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function rewardItemToIndices(
  item: RewardItem,
): Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>> {
  if (item.slot === 'skin') return { skin: item.riveIndex };
  if (item.slot === 'hat') return { hat: item.riveIndex };
  if (item.slot === 'body') return { body: item.riveIndex };
  if (item.slot === 'hand_item') return { hand_item: item.riveIndex };
  return {};
}

export function GrowPondCard({
  onInvite,
  onAdd,
  enabled,
  paused = false,
}: {
  onInvite: () => void;
  onAdd: () => void;
  enabled: boolean;
  paused?: boolean;
}) {
  const { data: config } = useSWR<InviteConfig>('/api/invite/config', fetcher, {
    revalidateOnFocus: false,
  });
  const { data: status } = useSWR<InviteStatus>('/api/invite/status', fetcher, {
    revalidateOnFocus: false,
  });

  const rewards = config?.rewards ?? [];
  const claimed = status?.claimedCount ?? 0;
  const nextReward = rewards.find((r) => r.tier > claimed) ?? null;
  const previewReward = nextReward ?? rewards[rewards.length - 1] ?? null;
  const completedAll = rewards.length > 0 && !nextReward;

  const giftItems = React.useMemo(
    () =>
      (config?.giftOptions ?? [])
        .map((g) => g.item)
        .filter((i): i is RewardItem => !!i && i.slot !== 'container'),
    [config?.giftOptions],
  );
  const randomGift = React.useMemo(
    () =>
      giftItems.length
        ? giftItems[Math.floor(Math.random() * giftItems.length)]
        : null,
    [giftItems],
  );

  const item =
    (completedAll ? randomGift : null) ?? previewReward?.item ?? null;
  const isOutfit = !!item && item.slot !== 'container';
  const target =
    nextReward?.tier ?? previewReward?.tier ?? Math.max(1, claimed);
  const needed = Math.max(0, target - claimed);
  const progress = completedAll
    ? 100
    : Math.min(100, Math.round((claimed / Math.max(1, target)) * 100));

  return (
    <section
      data-hint="invite-friend"
      className="relative -mx-4 mt-2 overflow-hidden bg-[#25482a] px-4 py-7 text-white md:-mx-8 md:rounded-[28px] md:px-8"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#4f9149]/35 blur-2xl"
      />

      <div className="relative flex items-center gap-4">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/15">
          {isOutfit && item ? (
            <Frog
              className="-translate-y-[16px]"
              width={112}
              height={96}
              indices={rewardItemToIndices(item)}
              paused={paused}
            />
          ) : item?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.icon} alt="" className="h-14 w-14 object-contain" />
          ) : (
            <Fly size={52} y={-2} paused />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#a5d6a7]">
            {completedAll ? 'Send a gift' : 'Grow your pond'}
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight tracking-tight sm:text-xl">
            {nextReward
              ? `${needed} more ${needed === 1 ? 'friend' : 'friends'} unlocks ${item?.name ?? 'your next reward'}`
              : 'Invite a friend, gift them a free outfit'}
          </h2>
          {!completedAll && (
            <div className="mt-3 flex items-center gap-2.5">
              <span
                role="progressbar"
                aria-label="Invite reward progress"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(claimed, target)}
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15"
              >
                <span
                  className="block h-full w-full origin-left rounded-full bg-[#8ed07f] transition-transform duration-500"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </span>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-white/70">
                {claimed}/{target}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onInvite}
          className="min-h-[3.25rem] flex-1 touch-manipulation rounded-2xl bg-[#8ed07f] py-3.5 text-[15px] font-black tracking-tight text-[#1c3720] shadow-[0_4px_0_#5f9c53] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#25482a]"
        >
          Invite a friend
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add by friend code"
          className="flex min-h-[3.25rem] w-14 shrink-0 touch-manipulation items-center justify-center rounded-2xl bg-white/12 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#25482a]"
        >
          <UserPlus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      <FriendSuggestionsRow
        enabled={enabled}
        variant="embedded"
        tone="inverted"
        title="People you may know"
        subtitle="Add them and you both start filling each other's pond"
        className="mt-6"
      />
    </section>
  );
}
