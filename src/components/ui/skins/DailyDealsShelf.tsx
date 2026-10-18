'use client';

import React from 'react';
import { ChevronRight, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { rewardedAdsAvailable } from '@/lib/ads';
import type { ItemDef } from '@/lib/skins/catalog';
import type { DailyDeal } from '@/lib/skins/dailyDeal';
import { ShelfHeader, shelfActionClass } from './DressingRoom';

export function useCountdown(endsAt: string | undefined) {
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
  saleCount = 0,
  onClick,
}: {
  endsAt?: string;
  saleCount?: number;
  onClick: () => void;
}) {
  const countdown = useCountdown(endsAt);
  if (!endsAt) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 mb-1 flex w-full items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-100/70 to-amber-50/40 px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.99] dark:from-amber-900/30 dark:to-amber-950/20"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-black tracking-wide text-foreground">
        {saleCount > 0
          ? `${saleCount} on sale at the shop`
          : "Today's shop is up"}
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
  rerollsLeft = 0,
  rerolling = false,
  wishlistedIds,
  onReroll,
  onUpgrade,
  renderEntries,
}: {
  deals: DailyDeal[];
  catalog: ItemDef[];
  isPremium: boolean;
  rerollsLeft?: number;
  rerolling?: boolean;
  wishlistedIds?: Set<string>;
  onReroll: () => void;
  onUpgrade: () => void;
  renderEntries: (
    entries: { deal: DailyDeal; item: ItemDef }[],
  ) => React.ReactNode;
}) {
  const countdown = useCountdown(deals[0]?.endsAt);
  const byId = React.useMemo(
    () => new Map(catalog.map((i) => [i.id, i])),
    [catalog],
  );
  const isWishlisted = (id: string) => !!wishlistedIds?.has(id);
  const entries = deals
    .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
    .filter((e): e is { deal: DailyDeal; item: ItemDef } => !!e.item)
    .sort(
      (a, b) =>
        Number(b.deal.onSale) - Number(a.deal.onSale) ||
        Number(isWishlisted(b.item.id)) - Number(isWishlisted(a.item.id)),
    );

  if (!entries.length) return null;

  const canReroll = rerollsLeft > 0 && !rerolling;
  const adReroll = !isPremium && rewardedAdsAvailable();
  const rerollUnavailable = !isPremium && !adReroll;

  return (
    <section aria-label="Today's deals">
      <ShelfHeader
        icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.75} />}
        label="Today's deals"
        meta={
          <>
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            {countdown}
          </>
        }
        action={
          <button
            type="button"
            onClick={
              rerollUnavailable ? onUpgrade : canReroll ? onReroll : undefined
            }
            disabled={!rerollUnavailable && !canReroll}
            className={shelfActionClass(
              !rerollUnavailable && !canReroll ? 'quiet' : 'amber',
            )}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', rerolling && 'animate-spin')}
              strokeWidth={2.75}
            />
            {rerollUnavailable ? (
              <>
                Reroll
                <Icon name="frogPlus" label="Plus" className="h-5 w-5" />
              </>
            ) : !canReroll ? (
              'Rerolled'
            ) : adReroll ? (
              <>
                Reroll
                <AdPlayIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              </>
            ) : (
              'Reroll'
            )}
          </button>
        }
      />
      {renderEntries(entries)}
    </section>
  );
}
