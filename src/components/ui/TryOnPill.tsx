'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { useTryOnStore } from '@/lib/tryOnStore';
import { useInventory } from '@/hooks/useInventory';
import { useWishlist } from '@/hooks/useWishlist';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { hapticTick } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

const AUTO_DISMISS_MS = 14_000;

export function TryOnPill({ className }: { className?: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
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

  const dismiss = () => {
    if (!offer) return;
    hapticTick();
    trackAnalyticsEvent('tryon_dismissed', {
      item_id: offer.itemId,
      reason: 'manual',
    });
    clear();
  };

  const keep = async () => {
    if (!offer) return;
    hapticTick();
    if (!canAfford) {
      trackAnalyticsEvent('tryon_kept', {
        item_id: offer.itemId,
        outcome: 'pinned',
      });
      await pin(offer.itemId, 'item');
      clear();
      return;
    }
    trackAnalyticsEvent('tryon_kept', {
      item_id: offer.itemId,
      outcome: 'shop_opened',
      price: offer.price,
    });
    clear();
    router.push(`/shop?item=${encodeURIComponent(offer.itemId)}&kind=item`);
  };

  const config = offer ? RARITY_CONFIG[offer.rarity] : null;

  return (
    <AnimatePresence initial={false}>
      {offer && config && (
        <motion.div
          key={offer.itemId}
          data-dock-row
          initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className={cn('w-full min-w-0 overflow-hidden rounded-b-[19px] md:basis-full', className)}
        >
          <div className="flex items-center gap-3 border-t border-border/50 py-2.5 pl-3 pr-1.5">
            <span
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                config.bg,
              )}
            >
              <Icon name="shuffle" className="h-7 w-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold leading-tight text-foreground">
                {offer.name}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1 text-[12px] font-semibold text-muted-foreground">
                <span className={cn('shrink-0 font-black', config.text)}>{config.label}</span>
                <span aria-hidden>·</span>
                <span className="truncate">Trying it on</span>
              </span>
            </span>
            <button
              type="button"
              onClick={keep}
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#447d3f] px-3 text-[13px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
            >
              {canAfford ? (
                <>
                  Keep
                  <FlyAmount amount={offer.price} size={14} className="text-white" />
                </>
              ) : (
                'Save for it'
              )}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Take it off"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors active:bg-foreground/5 [@media(hover:hover)]:hover:bg-foreground/5 [@media(hover:hover)]:hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.75} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
