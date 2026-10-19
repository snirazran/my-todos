'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { useTryOnStore } from '@/lib/tryOnStore';
import { useInventory } from '@/hooks/useInventory';
import { useWishlist } from '@/hooks/useWishlist';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { hapticTick } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

const AUTO_DISMISS_MS = 14_000;

/**
 * The "keep it?" offer for a shuffle try-on. Renders inline under the frog —
 * never as a modal and never over the task list — so it can be ignored
 * completely without blocking anything.
 */
export function TryOnPill({ className }: { className?: string }) {
  const router = useRouter();
  const offer = useTryOnStore((s) => s.offer);
  const clear = useTryOnStore((s) => s.clear);
  const { data } = useInventory(!!offer, true);
  const { pin } = useWishlist(!!offer);

  const balance = data?.wardrobe?.flies ?? 0;
  const canAfford = !!offer && balance >= offer.price;

  React.useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => {
      trackAnalyticsEvent('tryon_dismissed', {
        item_id: offer.itemId,
        reason: 'timeout',
      });
      clear();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [offer, clear]);

  if (!offer) return null;

  const config = RARITY_CONFIG[offer.rarity];

  const dismiss = () => {
    hapticTick();
    trackAnalyticsEvent('tryon_dismissed', {
      item_id: offer.itemId,
      reason: 'manual',
    });
    clear();
  };

  const keep = async () => {
    if (!canAfford) {
      trackAnalyticsEvent('tryon_kept', {
        item_id: offer.itemId,
        outcome: 'pinned',
      });
      await pin(offer.itemId, 'item');
      clear();
      return;
    }
    hapticTick();
    trackAnalyticsEvent('tryon_kept', {
      item_id: offer.itemId,
      outcome: 'shop_opened',
      price: offer.price,
    });
    clear();
    router.push(
      `/wardrobe?tab=shop&item=${encodeURIComponent(offer.itemId)}&kind=item`,
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        key={offer.itemId}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className={cn(
          'pointer-events-auto relative flex w-[min(340px,92vw)] items-center gap-2.5 rounded-2xl border-2 bg-card/95 py-2 pl-3 pr-9 shadow-lg backdrop-blur-xl',
          config.border,
          className,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black leading-tight tracking-tight text-foreground">
            Trying on: {offer.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
            {canAfford ? (
              <>
                Keep it for
                <FlyAmount amount={offer.price} size={11} className="text-foreground" />
                ?
              </>
            ) : (
              <>
                <FlyAmount amount={offer.price} size={11} className="text-foreground" />
                — save up for it?
              </>
            )}
          </span>
        </span>

        <button
          type="button"
          onClick={keep}
          className="flex h-9 shrink-0 items-center justify-center rounded-xl bg-[#447d3f] px-3 text-xs font-black tracking-wide text-white shadow-[0_3px_0_0_#2c511a] transition-all active:translate-y-0.5 active:shadow-none"
        >
          {canAfford ? 'Keep it' : 'Save for it'}
        </button>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss try-on"
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
