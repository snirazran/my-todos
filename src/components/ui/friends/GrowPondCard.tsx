'use client';
import React from 'react';
import useSWR from 'swr';
import { Gift, UserPlus } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';
import { POND_PRIMARY } from './PondSocial';
import { RarityBadge } from '@/components/ui/skins/RarityBadge';
import type { Rarity } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';

type RewardItem = { id: string; name: string; slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container'; riveIndex: number; rarity?: Rarity; icon?: string };
type RewardTier = { tier: number; label: string; item?: RewardItem | null };
type InviteConfig = { rewards: RewardTier[]; giftOptions?: { id: string; item?: RewardItem | null }[] };
const fetcher = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error('Could not load gifts'); return response.json(); };

export function GrowPondCard({ onInvite, onAdd, enabled, paused = false }: {
  onInvite: () => void; onAdd: () => void; enabled: boolean; paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { data: config } = useSWR<InviteConfig>(enabled ? '/api/invite/config' : null, fetcher, { revalidateOnFocus: false });
  const { data: status } = useSWR<{ claimedCount: number }>(enabled ? '/api/invite/status' : null, fetcher, { revalidateOnFocus: false });
  const claimed = status?.claimedCount ?? 0;
  const next = config?.rewards.find((reward) => reward.tier > claimed);
  return (
    <section data-hint="invite-friend">
      <div className="mb-3 px-1"><h2 className="text-lg font-black tracking-tight text-foreground">Make room for one more</h2></div>
      <div className="overflow-hidden rounded-[20px] border border-border/60 bg-card">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div aria-hidden className="relative flex h-[96px] w-[88px] shrink-0 items-center justify-center overflow-visible">
            <GiftRive width={112} height={112} color={0} paused={paused || !!reduceMotion} className="-mt-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-black tracking-tight text-foreground">A gift for your next pond pal</h3>
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">Pick their free welcome outfit. Bring them along.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3.5 pb-3.5">
          <button type="button" onClick={onInvite} className={cn(POND_PRIMARY, 'min-w-0 flex-1')}><Gift className="h-4 w-4" aria-hidden />Send a gift</button>
          <button type="button" onClick={onAdd} className="flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-border/60 px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><UserPlus className="h-4 w-4" aria-hidden />Add by code</button>
        </div>
        {next && status ? <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5"><span className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">Your next invite reward: <span className="font-bold text-foreground">{next.item?.name ?? next.label}</span></span><RarityBadge rarity={next.item?.rarity} /><span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">{claimed}/{next.tier}</span></div> : null}
      </div>
      <FriendSuggestionsRow enabled={enabled} variant="embedded" tone="default" title="People you may know" subtitle="More little habits. More good company." className="mt-4" />
    </section>
  );
}
