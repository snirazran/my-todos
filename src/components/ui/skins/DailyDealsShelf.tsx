'use client';

import React from 'react';
import { ChevronRight, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import Fly from '@/components/ui/fly';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import type { ItemDef } from '@/lib/skins/catalog';
import type { DailyDeal } from '@/lib/skins/dailyDeal';

function useCountdown(endsAt: string | undefined) {
  const [label, setLabel] = React.useState('');
  React.useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) {
        setLabel('0:00:00');
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(
        `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

export function DailyDealsTeaser({
  endsAt,
  onClick,
}: {
  endsAt?: string;
  onClick: () => void;
}) {
  const countdown = useCountdown(endsAt);
  if (!endsAt) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 flex w-full items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-100/70 to-amber-50/40 px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.99] dark:from-amber-900/30 dark:to-amber-950/20"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-wide text-foreground">
        Daily deals in the shop
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black tabular-nums text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        {countdown}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function DailyDealsShelf({
  deals,
  catalog,
  isPremium,
  onBuy,
  onUpgrade,
}: {
  deals: DailyDeal[];
  catalog: ItemDef[];
  isPremium: boolean;
  onBuy: (item: ItemDef, dealPrice: number) => void;
  onUpgrade: () => void;
}) {
  const countdown = useCountdown(deals[0]?.endsAt);
  const byId = React.useMemo(
    () => new Map(catalog.map((i) => [i.id, i])),
    [catalog],
  );
  const entries = deals
    .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
    .filter((e): e is { deal: DailyDeal; item: ItemDef } => !!e.item);

  if (!entries.length) return null;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Daily deals
          <Icon name="frogPlus" label="Plus deals" className="h-7 w-7" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card px-2.5 py-1 text-[11px] font-black tabular-nums text-foreground shadow-sm">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {countdown}
        </span>
      </div>

      <DragScrollRow>
        {entries.map(({ deal, item }) => {
          const config = RARITY_CONFIG[item.rarity];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                isPremium ? onBuy(item, deal.dealPrice) : onUpgrade()
              }
              className={cn(
                'relative flex w-[148px] shrink-0 flex-col items-stretch overflow-hidden rounded-xl border-2 bg-gradient-to-br p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
                config.border,
                config.gradient,
              )}
            >
              <div
                className={cn(
                  'absolute top-0 left-0 z-20 px-2 py-1 rounded-br-2xl text-[9px] font-black uppercase tracking-wider border-b border-r',
                  config.bg,
                  config.text,
                  config.border,
                )}
              >
                {config.label}
              </div>
              <div className="relative flex h-24 items-end justify-center overflow-hidden rounded-lg bg-background/50">
                <FrogSnapshot
                  className="h-[120%] w-[120%] object-contain"
                  indices={{ [item.slot]: item.riveIndex }}
                  width={170}
                  height={170}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1.5">
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through decoration-2 opacity-70">
                  {deal.priceFlies.toLocaleString()}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
                  <Fly size={26} paused y={-2} />
                  {deal.dealPrice.toLocaleString()}
                </span>
              </div>
              {!isPremium && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <Icon name="frogPlus" label="" className="h-5 w-5" />
                  with Plus
                </span>
              )}
            </button>
          );
        })}
      </DragScrollRow>

    </div>
  );
}
