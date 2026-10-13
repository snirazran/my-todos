'use client';

import { useEffect } from 'react';
import { QuestsPanel } from '@/components/ui/QuestsPanel';
import { revealSweepClaim } from '@/components/ui/RewardRoll';

export default function DevQuestsHarness() {
  useEffect(() => {
    (window as any).__roll = (tier: 'standard' | 'golden' = 'golden', winnerIndex = 2, mega = false) => {
      const table = [
        { id: 'a', chance: 32, reward: { type: 'BOX', itemId: 'gift_box_rare', amount: 1 } },
        { id: 'b', chance: 28, reward: { type: 'FLIES', amountMode: 'fixed', amount: 60 } },
        { id: 'c', chance: 16, reward: { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 } },
        { id: 'd', chance: 14, reward: { type: 'FLIES', amountMode: 'fixed', amount: 120 } },
        { id: 'h', chance: 10, reward: { type: 'BOX', itemId: 'gift_box_1', amount: 1 } },
        { id: 'e', chance: 6, reward: { type: 'SHIELD', amount: 1 } },
        { id: 'f', chance: 3, reward: { type: 'RARITY_ITEM', rarity: 'epic', amount: 1 } },
      ];
      revealSweepClaim(
        {
          fliesGranted: 0,
          rolled: {
            tier,
            mega,
            reward: table[winnerIndex].reward as any,
            megaRewards: mega ? [{ type: 'BOX', itemId: 'gift_box_legendary', amount: 1 }, { type: 'FLIES', amountMode: 'fixed', amount: 100 }] as any : [],
            table: table as any,
          },
        } as any,
        { catalog: {}, isPremium: false },
      );
    };
  }, []);
  return (
    <main className="h-[100dvh] overflow-hidden bg-background md:h-auto md:min-h-[100dvh] md:overflow-visible">
      <div className="flex h-full w-full flex-col md:h-auto">
        <QuestsPanel isGuest={false} />
      </div>
    </main>
  );
}
