import confetti from 'canvas-confetti';
import { rarityRank, type Rarity } from '@/lib/skins/catalog';
import { hapticCelebrate, hapticSuccess } from '@/lib/haptics';
import { playPurchaseFanfare } from '@/lib/catchSounds';

export const PURCHASE_CELEBRATION_EVENT = 'purchase-celebration';

export type PurchaseCelebrationDetail = {
  id: string;
  name: string;
  rarity: Rarity;
};

const CONFETTI_COLORS: Record<Rarity, string[]> = {
  common: ['#cbd5e1', '#94a3b8', '#e2e8f0', '#447d3f'],
  uncommon: ['#34d399', '#10b981', '#a7f3d0', '#447d3f'],
  rare: ['#38bdf8', '#0ea5e9', '#bae6fd', '#fde68a'],
  epic: ['#a78bfa', '#8b5cf6', '#ddd6fe', '#f0abfc'],
  legendary: ['#fbbf24', '#f59e0b', '#fde68a', '#fff7d6'],
};

const PARTICLES: Record<Rarity, number> = {
  common: 45,
  uncommon: 60,
  rare: 85,
  epic: 120,
  legendary: 160,
};

export function celebratePurchase(
  detail: PurchaseCelebrationDetail,
  anchor?: HTMLElement | null,
) {
  if (typeof window === 'undefined') return;
  const tier = rarityRank[detail.rarity] ?? 0;
  const big = detail.rarity === 'epic' || detail.rarity === 'legendary';
  if (big) hapticCelebrate();
  else hapticSuccess();
  playPurchaseFanfare(tier);

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    const rect = anchor?.getBoundingClientRect();
    const origin = rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        }
      : { x: 0.5, y: 0.45 };
    const colors = CONFETTI_COLORS[detail.rarity];
    confetti({
      particleCount: PARTICLES[detail.rarity],
      spread: 70 + tier * 10,
      startVelocity: 34 + tier * 3,
      origin,
      colors,
      zIndex: 99999,
      disableForReducedMotion: true,
    });
    if (big) {
      window.setTimeout(() => {
        confetti({
          particleCount: detail.rarity === 'legendary' ? 50 : 32,
          spread: 140,
          startVelocity: 24,
          shapes: ['star'],
          scalar: 1.3,
          origin,
          colors,
          zIndex: 99999,
          disableForReducedMotion: true,
        });
      }, 200);
    }
  }

  window.dispatchEvent(
    new CustomEvent<PurchaseCelebrationDetail>(PURCHASE_CELEBRATION_EVENT, {
      detail,
    }),
  );
}
