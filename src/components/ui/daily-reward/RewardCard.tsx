import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '../fly';
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
    rarity: 'uncommon',
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
  hideDayLabel,
  deferPreview = false,
  previewDelayMs = 0,
  previewRootMargin,
  previewUnmountDelayMs,
}: {
  day: number;
  rewardType: 'FLIES' | 'ITEM' | 'BOX';
  amount?: number;
  itemId?: string;
  status: 'CLAIMED' | 'READY' | 'LOCKED' | 'MISSED' | 'LOCKED_PREMIUM';
  onClick?: () => void;
  isPremiumTier?: boolean;
  isToday?: boolean;
  hideDayLabel?: boolean;
  deferPreview?: boolean;
  previewDelayMs?: number;
  previewRootMargin?: string;
  previewUnmountDelayMs?: number;
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

  const muted = status === 'LOCKED' || isMissed || (isLockedPremium && !isToday);
  let customAction: React.ReactNode;
  if (isReady) {
    customAction = (
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="w-full h-8 rounded-lg font-black uppercase tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm active:scale-95 transition-all"
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
        className="w-full h-8 rounded-lg font-black uppercase tracking-wide bg-amber-500 hover:bg-amber-600 text-white shadow-sm active:scale-95 transition-all"
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
  } else if (isClaimed && isToday) {
    customAction = (
      <div className="w-full h-8 flex items-center justify-center rounded-lg bg-emerald-500 border border-emerald-600 text-white text-[10px] font-black uppercase tracking-wide px-1 shadow-sm text-center leading-tight">
        Next gift tomorrow
      </div>
    );
  } else if (isClaimed) {
    customAction = (
      <div className="w-full h-8 flex items-center justify-center rounded-lg bg-emerald-100/80 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide px-1 shadow-sm gap-1">
        <Check className="w-3.5 h-3.5 stroke-[4]" /> Claimed
      </div>
    );
  } else {
    customAction = <div className="h-8 w-full" />; // Reserve space equal to button height
  }

  return (
    <div className="flex flex-col items-center gap-2 group w-full">
      {/* Card Wrapper - Responsive sizing for grid */}
      <div
        onClick={onClick}
        className={cn(
          'relative transition-all duration-300 w-full max-w-[192px] mx-auto scale-100',
          onClick && 'cursor-pointer',
          muted && 'opacity-70',
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
          deferPreview={deferPreview && rewardType !== 'FLIES'}
          previewDelayMs={previewDelayMs}
          previewRootMargin={previewRootMargin}
          previewUnmountDelayMs={previewUnmountDelayMs}
          previewClassName="translate-y-[18%] scale-110"
        />
        {muted && (
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-background/20" />
        )}
      </div>

      {/* Day Label - Hidden when layout handles it */}
      {!hideDayLabel && (
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
      )}
    </div>
  );
}
