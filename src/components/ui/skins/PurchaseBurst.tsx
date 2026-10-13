'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Rarity } from '@/lib/skins/catalog';
import {
  PURCHASE_CELEBRATION_EVENT,
  type PurchaseCelebrationDetail,
} from '@/lib/purchaseCelebration';

const BURST_COLOR: Record<Rarity, string> = {
  common: 'rgba(226, 232, 240, 0.85)',
  uncommon: 'rgba(110, 231, 183, 0.75)',
  rare: 'rgba(125, 211, 252, 0.8)',
  epic: 'rgba(196, 181, 253, 0.85)',
  legendary: 'rgba(252, 211, 77, 0.9)',
};

const BURST_MS = 1600;

export function PurchaseBurst({
  rarity,
  size = 340,
  className,
}: {
  rarity: Rarity;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'purchase-burst pointer-events-none absolute left-1/2 top-1/2',
        className,
      )}
      style={
        { width: size, height: size, '--burst': BURST_COLOR[rarity] } as React.CSSProperties
      }
    >
      <span className="purchase-burst-rays" />
      <span className="purchase-burst-glow" />
    </span>
  );
}

export function usePurchaseCelebration() {
  const [burst, setBurst] = useState<{ key: number; rarity: Rarity } | null>(
    null,
  );

  useEffect(() => {
    let timer = 0;
    const onCelebrate = (event: Event) => {
      const detail = (event as CustomEvent<PurchaseCelebrationDetail>).detail;
      if (!detail) return;
      window.clearTimeout(timer);
      setBurst({ key: Date.now(), rarity: detail.rarity });
      timer = window.setTimeout(() => setBurst(null), BURST_MS);
    };
    window.addEventListener(PURCHASE_CELEBRATION_EVENT, onCelebrate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PURCHASE_CELEBRATION_EVENT, onCelebrate);
    };
  }, []);

  return burst;
}
