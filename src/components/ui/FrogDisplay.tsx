'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';

import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { CurrencyShop } from '@/components/ui/shop/CurrencyShop';
import { prefetchQuests } from './QuestsPanel';

type Props = {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number };
  indices?: Partial<Record<WardrobeSlot, number>>;
  openWardrobe: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  flyBalance?: number;
  rate?: number;
  done?: number;
  total?: number;
  isCatching?: boolean;
  animateBalance?: boolean;
  animateHunger?: boolean;
  hunger?: number;
  maxHunger?: number;
  isGuest?: boolean;
  questClaimableCount?: number;
  questActiveCount?: number;
  deferInventorySummary?: boolean;
  paused?: boolean;
  showActionButtons?: boolean;
  showSpeechBubble?: boolean;
};

export function FrogDisplay({
  frogRef,
  frogBoxRef,
  mouthOpen = false,
  mouthOffset,
  indices,
  openWardrobe,
  onOpenChange,
  className = '',
  flyBalance,
  rate,
  done,
  total,
  isCatching,
  animateBalance = true,
  animateHunger = true,
  hunger,
  maxHunger,
  isGuest,
  questClaimableCount = 0,
  questActiveCount = 0,
  deferInventorySummary = false,
  paused = false,
  showActionButtons = true,
  showSpeechBubble = true,
}: Props) {
  const router = useRouter();
  const { unseenCount, unseenContainerCount } = useInventory(
    !isGuest && (!deferInventorySummary || openWardrobe),
    true,
  );
  const [clickedAt, setClickedAt] = React.useState(0);
  const [shopOpen, setShopOpen] = React.useState(false);

  const wardrobeBadge = unseenCount + unseenContainerCount;

  // Local state for smooth hunger updates
  const [displayedHunger, setDisplayedHunger] = React.useState(hunger ?? 0);

  // Sync with prop updates
  React.useEffect(() => {
    if (typeof hunger === 'number') {
      setDisplayedHunger(hunger);
    }
  }, [hunger]);

  // Constant visual decay
  React.useEffect(() => {
    if (!animateHunger) return;

    const interval = setInterval(() => {
      setDisplayedHunger((prev) => {
        if (prev <= 0) return 0;
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [animateHunger]);

  const hungerPercent =
    typeof displayedHunger === 'number' && typeof maxHunger === 'number'
      ? Math.max(0, Math.min(100, (displayedHunger / maxHunger) * 100))
      : 100;

  // Expanded hunger states for better transition. The label is always
  // "HUNGER LEVEL" — the color/fill conveys how full the frog is.
  const getHungerState = (p: number) => {
    if (p > 80)
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-500',
        label: 'Hunger bar',
      };
    if (p > 60)
      return { bg: 'bg-lime-500', text: 'text-lime-500', label: 'Hunger bar' };
    if (p > 40)
      return {
        bg: 'bg-yellow-500',
        text: 'text-yellow-500',
        label: 'Hunger bar',
      };
    if (p > 20)
      return { bg: 'bg-amber-500', text: 'text-amber-500', label: 'Hunger bar' };
    return { bg: 'bg-rose-500', text: 'text-rose-500', label: 'Hunger bar' };
  };

  const {
    bg: hungerColor,
    text: hungerTextColor,
    label: hungerStatus,
  } = getHungerState(hungerPercent);

  return (
    // Added mb-12 to create the requested space from the tabs below

    <div
      className={`${className} flex flex-col items-center mb-2 md:mb-2 relative md:-translate-y-6`}
    >
      <CurrencyShop
        open={shopOpen}
        onOpenChange={setShopOpen}
        balance={flyBalance ?? 0}
      />

      <div
        ref={frogBoxRef}
        className="relative z-50 -mb-6 transition-transform duration-500 origin-top scale-100 pointer-events-none -translate-y-9 md:mb-6 md:scale-100 md:translate-y-3"
      >
        <div
          className="cursor-pointer pointer-events-auto"
          onClick={() => setClickedAt(Date.now())}
        >
          <Frog
            ref={frogRef}
            mouthOpen={!!mouthOpen}
            mouthOffset={mouthOffset}
            indices={indices}
            paused={paused}
          />
        </div>

        {/* SPEECH BUBBLE - NOW INSIDE FROG'S CONTAINER */}

        {showSpeechBubble &&
          typeof rate === 'number' &&
          typeof done === 'number' &&
          typeof total === 'number' && (
            <FrogSpeechBubble
              rate={rate}
              done={done}
              total={total}
              readyQuests={questClaimableCount}
              isCatching={isCatching}
              clickedAt={clickedAt}
              className="!top-20"
            />
          )}
      </div>

      {/* 2. THE CONTROL DECK 

                - Ceramic Glass Aesthetic

                - Subtle gradient border

            */}

      <div
        className="relative z-10 -mt-6 flex items-center justify-center

              w-[340px] max-w-[min(94vw,100%)] h-[50px] px-2

              bg-card/80

              backdrop-blur-2xl

              rounded-[18px]

              border border-border/50

              shadow-sm"
      >
        {/* Decorative Top Highlight to simulate glass edge light */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />

        {/* Full Width Hunger Pill */}
        <div className="relative flex flex-col justify-center w-full h-full px-3">
          {typeof hunger === 'number' ? (
            <div
              className={cn(
                'relative h-6 w-full overflow-hidden rounded-full bg-muted transition-all duration-200',
                hungerPercent <= 20 && 'ring-1 ring-rose-500/10',
              )}
            >
              {/* Dark base label — readable on the muted bg where the fill doesn't reach (non-starving states) */}
              {hungerPercent > 20 && (
                <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                  <span className="text-[11px] font-black tracking-[0.06em] text-foreground/75 whitespace-nowrap">
                    {hungerStatus}
                  </span>
                </div>
              )}
              {/* Fill bar with white label inside; overflow-hidden clips the label to the fill width */}
              <div className="absolute inset-1">
                <div
                  className={cn(
                    'relative h-full min-w-6 rounded-full overflow-hidden',
                    animateHunger && 'transition-all duration-1000 ease-in-out',
                    hungerColor,
                  )}
                  style={{ width: `${Math.max(hungerPercent, 4)}%` }}
                >
                  {hungerPercent > 20 && (
                    <div className="absolute top-0 bottom-0 left-3 flex items-center pointer-events-none">
                      <span className="text-[11px] font-black tracking-[0.06em] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] whitespace-nowrap">
                        {hungerStatus}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {/* Starving: render dark label on top of everything so it stays readable over the small red fill */}
              {hungerPercent <= 20 && (
                <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                  <span className="text-[11px] font-black tracking-[0.06em] text-foreground/85 whitespace-nowrap">
                    {hungerStatus}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>
    </div>
  );
}
