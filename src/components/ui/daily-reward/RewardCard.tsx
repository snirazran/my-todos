import React from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '../fly';
import { byId, ItemDef } from '@/lib/skins/catalog';
import { ItemCard } from '../skins/ItemCard';
import { Button } from '@/components/ui/button';
import {
  RewardTile,
  sortStreakPrizes,
  type QuestRewardCatalogItem,
} from '../QuestCards';
import type { QuestReward } from '@/lib/quests/types';

// Helper to create dummy item def for flies/boxes
const getRewardItemDef = (
  type: 'FLIES' | 'ITEM' | 'BOX' | 'BACKGROUND',
  amount?: number,
  itemId?: string,
): ItemDef => {
  if (type === 'ITEM' && itemId && byId[itemId]) {
    return byId[itemId];
  }

  if (type === 'BOX') {
    // Prefer the real catalog entry so the gift's rarity label and visual
    // (riveIndex → 0 green/common, 1 blue/rare, 2 red/legendary) match the
    // actual box being awarded. Fall back to a generic box only if unknown.
    if (itemId && byId[itemId]) {
      return byId[itemId];
    }

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
  pausePreview = false,
  previewDelayMs = 0,
  previewRootMargin,
  previewUnmountDelayMs,
  hideDropRates,
  forceFullOpacity,
  lockOverlay,
  hideAction,
  giftAnimation,
  rewards,
  rewardCatalog,
}: {
  day: number;
  rewardType: 'FLIES' | 'ITEM' | 'BOX' | 'BACKGROUND';
  amount?: number;
  itemId?: string;
  status: 'CLAIMED' | 'READY' | 'LOCKED' | 'MISSED' | 'LOCKED_PREMIUM';
  onClick?: () => void;
  isPremiumTier?: boolean;
  isToday?: boolean;
  hideDayLabel?: boolean;
  deferPreview?: boolean;
  pausePreview?: boolean;
  previewDelayMs?: number;
  previewRootMargin?: string;
  previewUnmountDelayMs?: number;
  hideDropRates?: boolean;
  forceFullOpacity?: boolean;
  lockOverlay?: boolean;
  /** Suppress the Claim/Unlock button while keeping the card state visuals —
   *  used when several cards share one lane and only one should carry it. */
  hideAction?: boolean;
  /** Optional gift-box animation override (e.g. 'box_shake'). */
  giftAnimation?: string;
  /** Full reward list for this lane. When it holds more than one, the preview
   *  becomes the fanned tile stack instead of the single large preview. */
  rewards?: QuestReward[];
  rewardCatalog?: Record<string, QuestRewardCatalogItem>;
}) {
  const isReady = status === 'READY';
  const isLockedPremium = status === 'LOCKED_PREMIUM';
  const isMissed = status === 'MISSED';
  const isClaimed = status === 'CLAIMED';
  const canUnlock = isLockedPremium && isToday && !!onClick;

  // Two prizes on one lane fan out as a tile stack, matching how an objective
  // shows several rewards. Rarest first, so it sits on top.
  const fannedRewards =
    rewards && rewards.length > 1
      ? sortStreakPrizes(rewards, rewardCatalog ?? {})
      : null;

  // The card frame (rarity, name) follows the headline prize — the rarest of
  // the fan, not whichever reward happens to be stored first.
  const headline = fannedRewards?.[0];
  const cardType = headline?.type ?? rewardType;
  const cardAmount = headline ? headline.amount : amount;
  const cardItemId = headline ? headline.itemId : itemId;

  const itemDef = getRewardItemDef(cardType, cardAmount, cardItemId);

  const fanPreview = fannedRewards ? (
    <div className="flex h-full w-full items-center justify-center">
      {fannedRewards.map((reward, i) => {
        const centerOffset = i - (fannedRewards.length - 1) / 2;
        return (
          <div
            key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? reward.amount ?? i}`}
            className="relative"
            style={{
              marginLeft: i === 0 ? 0 : -6,
              transform: `rotate(${centerOffset * 7}deg) translateY(${Math.abs(centerOffset) * 3}px)`,
              zIndex: fannedRewards.length - i,
            }}
          >
            <RewardTile
              reward={reward}
              rewardCatalog={rewardCatalog ?? {}}
              isPremium={!!isPremiumTier}
              compact
              paused={pausePreview}
              flySize={22}
              hydrateDelayMs={150 + i * 100}
              giftAnimation={i === 0 ? giftAnimation : undefined}
              className="h-12 w-12 rounded-xl ring-2 ring-card"
            />
          </div>
        );
      })}
    </div>
  ) : undefined;

  // Custom Preview for Flies
  const customPreview =
    fanPreview ??
    (rewardType === 'FLIES' ? (
      <div className="flex flex-col items-center justify-center gap-1 h-full w-full pb-0">
        <div className="relative">
          <Fly size={60} paused={pausePreview} interactive={false} />
        </div>
      </div>
    ) : undefined);

  const muted = status === 'LOCKED' || isMissed || (isLockedPremium && !isToday);
  let customAction: React.ReactNode;
  if (isReady && !hideAction) {
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
  } else if (canUnlock && !hideAction) {
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
        )}
      >
        <ItemCard
          item={itemDef}
          // Fanned tiles carry their own badges; a card-level count would
          // double up and only describe one of the two prizes.
          ownedCount={
            fannedRewards ? 0 : rewardType === 'FLIES' ? amount || 0 : 0
          }
          isEquipped={false}
          canAfford={false}
          actionLoading={false}
          mode="inventory" // Dummy mode
          customAction={customAction}
          customPreview={customPreview}
          hidePrice={true}
          hideRarity={cardType === 'FLIES'} // Hide rarity for flies
          hideDropRates={hideDropRates}
          deferPreview={deferPreview && rewardType !== 'FLIES'}
          pausePreview={pausePreview && itemDef.slot !== 'container'}
          previewDelayMs={previewDelayMs}
          previewRootMargin={previewRootMargin}
          previewUnmountDelayMs={previewUnmountDelayMs}
          giftAnimation={giftAnimation}
          previewClassName={cn(
            // The fan positions its own tiles; the single-preview scale/lift
            // would skew the stack.
            !fannedRewards && 'scale-110',
            !fannedRewards &&
              // Only lift gift boxes; leave frog skins at their default position.
              (itemDef.slot === 'container'
                ? '-translate-y-[12%]'
                : 'translate-y-[18%]'),
          )}
          previewTopLeftBadge={
            isClaimed ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white">
                <Check className="h-3.5 w-3.5" strokeWidth={4} />
              </span>
            ) : lockOverlay ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white">
                <Lock className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : null
          }
        />
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
          {`Day ${day}`}
        </span>
      )}
    </div>
  );
}
