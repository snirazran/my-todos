'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { Brain, Shirt, ScrollText } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { CurrencyShop } from '@/components/ui/shop/CurrencyShop';
import { prefetchQuests } from './QuestsPanel';

type Props = {
  frogRef: React.RefObject<FrogHandle>;
  frogBoxRef?: React.RefObject<HTMLDivElement>;
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
  onOpenProgressCoach?: () => void;
  progressCoachIsPremium?: boolean;
  deferInventorySummary?: boolean;
  paused?: boolean;
  showActionButtons?: boolean;
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
  onOpenProgressCoach,
  progressCoachIsPremium = false,
  deferInventorySummary = false,
  paused = false,
  showActionButtons = true,
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

  // Expanded hunger states for better transition
  const getHungerState = (p: number) => {
    if (p > 80)
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-500',
        label: 'FULL TUMMY',
      };
    if (p > 60)
      return { bg: 'bg-lime-500', text: 'text-lime-500', label: 'HAPPY' };
    if (p > 40)
      return { bg: 'bg-yellow-500', text: 'text-yellow-500', label: 'PECKISH' };
    if (p > 20)
      return { bg: 'bg-amber-500', text: 'text-amber-500', label: 'GRUMPY' };
    return { bg: 'bg-rose-500', text: 'text-rose-500', label: 'HANGRY!!' };
  };

  const {
    bg: hungerColor,
    text: hungerTextColor,
    label: hungerStatus,
  } = getHungerState(hungerPercent);

  return (
    // Added mb-12 to create the requested space from the tabs below

    <div
      className={`${className} flex flex-col items-center mb-2 md:mb-2 relative`}
    >
      <CurrencyShop
        open={shopOpen}
        onOpenChange={setShopOpen}
        balance={flyBalance ?? 0}
        hunger={displayedHunger}
        maxHunger={maxHunger ?? 100}
      />

      <div
        ref={frogBoxRef}
        className="relative z-50 -mb-8 origin-top scale-[0.82] transition-transform duration-500 -translate-y-3.5 pointer-events-none md:mb-0 md:scale-100 md:-translate-y-3.5"
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

        {typeof rate === 'number' &&
          typeof done === 'number' &&
          typeof total === 'number' && (
            <FrogSpeechBubble
              rate={rate}
              done={done}
              total={total}
              readyQuests={questClaimableCount}
              isCatching={isCatching}
              clickedAt={clickedAt}
            />
          )}
      </div>

      {/* 2. THE CONTROL DECK 

                - Ceramic Glass Aesthetic

                - Subtle gradient border

            */}

      <div
        className="relative z-10 -mt-6 flex items-center justify-center 

              w-[340px] max-w-[min(94vw,100%)] h-[64px] px-2

              bg-card/80

              backdrop-blur-2xl

              rounded-[18px]

              border border-border/50

              shadow-sm"
      >
        {/* Decorative Top Highlight to simulate glass edge light */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />
        
        {/* Full Width Hunger Pill */}
        <div className="relative w-full h-full flex flex-col justify-center gap-1.5 px-3">
          {typeof hunger === 'number' ? (
            <>
              {/* Hunger Title and Status */}
              <div className="flex justify-between items-end w-full px-0.5">
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-[0.15em]">
                  Hunger Level
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shadow-sm animate-pulse',
                      hungerColor,
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-black uppercase tracking-[0.1em]',
                      hungerTextColor,
                    )}
                  >
                    {hungerStatus}
                  </span>
                </div>
              </div>

              <div
                className={cn(
                  'group relative overflow-hidden flex items-center justify-start h-[14px] w-full rounded-full bg-muted/30 shadow-inner border border-border/20 transition-all duration-200',
                  hungerPercent <= 20 && 'ring-1 ring-rose-500/10',
                )}
              >
                {/* Hunger Fill Background - Horizontal */}
                <div
                  className={cn(
                    'absolute top-0 left-0 bottom-0 z-0 w-full origin-left',
                    animateHunger && 'transition-transform duration-1000 ease-in-out',
                    hungerColor,
                  )}
                  style={{
                    transform: `scaleX(${hungerPercent / 100})`,
                    opacity: 0.8,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>
    </div>
  );
}
