import React from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '../fly';
import { GiftRive } from '../gift-box/GiftBox';
import { byId, ItemDef } from '@/lib/skins/catalog';
import { ItemCard } from '../skins/ItemCard';
import { Button } from '@/components/ui/button';

// Helper to create dummy item def for flies/boxes
const getRewardItemDef = (
  type: 'FLIES' | 'ITEM' | 'BOX',
  amount?: number,
  itemId?: string,
): ItemDef => {
  if (type === 'ITEM' && itemId && byId[itemId]) {
    return byId[itemId];
  }

  if (type === 'BOX') {
    return {
      id: itemId || 'mystery_box',
      name: 'Mystery Box',
      rarity:
        itemId?.includes('gold') || itemId?.includes('diamond')
          ? 'legendary'
          : 'rare',
      priceFlies: 0,
      slot: 'container',
      riveIndex: 0, // Handled by custom preview or gift component
      icon: '', // Handled by Rive preview
    };
  }

  // DEFAULT: FLIES
  return {
    id: 'flies_reward',
    name: `${amount || 0} Flies`,
    rarity: 'common',
    priceFlies: 0,
    slot: 'hand_item', // Dummy
    riveIndex: 0,
    icon: '', // Handled by custom preview
  };
};

export function SingleRewardCard({
  day,
  rewardType,
  amount,
  itemId,
  status,
  onClick,
  isPremiumTier,
  isToday,
}: {
  day: number;
  rewardType: 'FLIES' | 'ITEM' | 'BOX';
  amount?: number;
  itemId?: string;
  status: 'CLAIMED' | 'READY' | 'LOCKED' | 'MISSED' | 'LOCKED_PREMIUM';
  onClick?: () => void;
  isPremiumTier?: boolean;
  isToday?: boolean;
}) {
  const isReady = status === 'READY';
  const isLockedPremium = status === 'LOCKED_PREMIUM';
  const isMissed = status === 'MISSED';
  const isClaimed = status === 'CLAIMED';

  const itemDef = getRewardItemDef(rewardType, amount, itemId);

  // Custom Preview for Flies
  const customPreview =
    rewardType === 'FLIES' ? (
      <div className="flex flex-col items-center justify-center gap-1 h-full w-full pb-0">
        <div className="relative">
          <Fly size={60} />
        </div>
      </div>
    ) : undefined;

  // Custom Action Button
  // ONLY show button if READY.
  // If Missed -> Show "Missed" button (disabled/destructive style)
  // If Locked Premium AND Today -> Show "Unlock" button
  // If Claimed, Locked -> No button, but reserve space so card size is consistent
  let customAction: React.ReactNode;
  if (isReady) {
    customAction = (
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="w-full h-8 rounded-lg font-black uppercase tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 active:scale-95 transition-all"
      >
        Claim
      </Button>
    );
  } else if (isLockedPremium && isToday) {
    customAction = (
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="w-full h-8 rounded-lg font-black uppercase tracking-wide bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
      >
        Unlock
      </Button>
    );
  } else if (isMissed) {
    customAction = (
      <Button
        disabled
        variant="destructive"
        className="w-full h-8 rounded-lg font-black uppercase tracking-wide opacity-80"
      >
        Missed
      </Button>
    );
  } else {
    customAction = <div className="h-8 w-full" />; // Reserve space equal to button height
  }

  return (
    <div className="flex flex-col items-center gap-2 group">
      {/* Card Wrapper - Increased size to match Shop (approx 176px) */}
      <div
        onClick={onClick}
        className={cn(
          'relative transition-all duration-300 w-44 sm:w-48 scale-100',
          onClick && 'cursor-pointer',
          status !== 'READY' &&
            status !== 'CLAIMED' &&
            !(isLockedPremium && isToday) &&
            'opacity-60 grayscale-[0.5]',
        )}
      >
        <ItemCard
          item={itemDef}
          ownedCount={rewardType === 'FLIES' ? amount || 0 : 0}
          isEquipped={false}
          canAfford={false}
          actionLoading={false}
          mode="inventory" // Dummy mode
          customAction={customAction}
          customPreview={customPreview}
          hidePrice={true}
          hideRarity={rewardType === 'FLIES'} // Hide rarity for flies
        />
      </div>

      {/* Day Label - Moved Below */}
      <span
        className={cn(
          'text-xs font-bold uppercase tracking-wider',
          isReady
            ? 'text-primary'
            : isLockedPremium && isToday
              ? 'text-amber-500'
              : 'text-muted-foreground/70',
        )}
      >
        {isClaimed ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 shadow-sm">
            <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white">
              <Check className="w-2.5 h-2.5 stroke-[4]" />
            </div>
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Claimed
            </span>
          </div>
        ) : (
          `Day ${day}`
        )}
      </span>
    </div>
  );
}

// Export the unused component just in case, or we can simply export SingleRewardCard as default or similar.
// For now, I'll leave the named export as is, and remove the unused `RewardCard` function from this file to clean up.
