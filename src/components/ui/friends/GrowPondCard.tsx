'use client';
import React from 'react';
import useSWR from 'swr';
import { ChevronRight, Gift } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { QuestTrack } from '@/components/ui/QuestTrack';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { POND_PILL, POND_ROW, POND_ROW_PRESS } from './PondSocial';
import { giftPreviewIndices } from '@/lib/friends/social';
import type { Rarity } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';

type RewardItem = { id: string; name: string; slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container'; riveIndex: number; rarity?: Rarity; icon?: string };
type RewardTier = { tier: number; label: string; item?: RewardItem | null };
type InviteConfig = { rewards: RewardTier[] };
const fetcher = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error('Could not load gifts'); return response.json(); };

function RewardThumb({ item, paused }: { item?: RewardItem | null; paused: boolean }) {
  if (!item) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/[0.12] text-primary">
        <Gift className="h-6 w-6" strokeWidth={2.25} aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn('relative flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-br', RARITY_CONFIG[item.rarity ?? 'common'].gradient)}>
      {item.slot === 'container' ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-[124%] w-[124%] -translate-y-[13%]">
            <GiftRive className="h-full w-full" color={item.riveIndex} paused={paused} />
          </span>
        </span>
      ) : (
        <span className="shrink-0">
          <FrogSnapshot width={63} height={63} indices={giftPreviewIndices(item)} visualOffsetY={0} />
        </span>
      )}
    </span>
  );
}

export function GrowPondCard({ onInvite, enabled, emphasize = false, paused = false }: {
  onInvite: () => void; enabled: boolean; emphasize?: boolean; paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { data: config } = useSWR<InviteConfig>(enabled ? '/api/invite/config' : null, fetcher, { revalidateOnFocus: false });
  const { data: status } = useSWR<{ claimedCount: number }>(enabled ? '/api/invite/status' : null, fetcher, { revalidateOnFocus: false });
  const claimed = status?.claimedCount ?? 0;
  const next = config?.rewards.find((reward) => reward.tier > claimed);
  const remaining = next ? Math.max(1, next.tier - claimed) : 0;
  const prize = next?.item?.name ?? next?.label;
  return (
    <button
      type="button"
      data-hint="invite-friend"
      onClick={onInvite}
      className={cn('flex w-full items-center gap-3 py-2.5 pl-2.5 pr-3 md:pr-3.5', POND_ROW, POND_ROW_PRESS)}
    >
      <RewardThumb item={next?.item} paused={paused || !!reduceMotion} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-baseline gap-1.5 text-[14px] font-bold leading-tight text-foreground">
          <span className="shrink-0">{remaining > 1 ? 'Invite ' + remaining + ' friends' : 'Invite a friend'}</span>
          {prize ? <span className="min-w-0 truncate text-[13px] font-semibold text-muted-foreground">· {prize}</span> : null}
        </span>
        {next && status ? (
          <QuestTrack progress={claimed} target={next.tier} />
        ) : (
          <span className="truncate text-[12.5px] font-semibold text-muted-foreground">They get a free outfit</span>
        )}
      </span>
      {emphasize ? (
        <span className={cn(POND_PILL, 'bg-primary text-primary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]')}>
          <Gift className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Invite
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
      )}
    </button>
  );
}
