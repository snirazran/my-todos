'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Brain, Shirt, ScrollText } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { CurrencyShop } from '@/components/ui/shop/CurrencyShop';
import { QuestsPopup, prefetchQuests } from './QuestsPopup';
import { useUIStore } from '@/lib/uiStore';

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
  onQuestsChanged?: () => void | Promise<void>;
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
  onQuestsChanged,
  onOpenProgressCoach,
  progressCoachIsPremium = false,
  deferInventorySummary = false,
  paused = false,
  showActionButtons = true,
}: Props) {
  const { unseenCount, unseenContainerCount } = useInventory(
    !isGuest && (!deferInventorySummary || openWardrobe),
    true,
  );
  const [clickedAt, setClickedAt] = React.useState(0);
  const [shopOpen, setShopOpen] = React.useState(false);

  const { isQuestsOpen, setQuestsOpen } = useUIStore();
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
        className="relative z-10 -mt-6 flex items-center justify-between 

              w-[340px] max-w-[min(94vw,100%)] h-[64px] px-2

              bg-card/80

              backdrop-blur-2xl

              rounded-[18px]

              border border-border/50

              shadow-sm"
      >
        {/* Decorative Top Highlight to simulate glass edge light */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />
        {/* Left Section: Unified Balance & Hunger Pill */}
        <div className="relative flex items-center ml-1">
          {typeof flyBalance === 'number' ? (
            <div
              onClick={() => {
                if (!isGuest) setShopOpen(true);
              }}
              className={cn(
                'group relative overflow-hidden flex items-center gap-2 pl-2 pr-4 py-1.5 h-[50px] rounded-[15px] bg-muted/50 shadow-inner border border-border/30 transition-all cursor-pointer active:scale-95 duration-200',
                !isGuest && 'hover:bg-muted/80',
                hungerPercent <= 20 && 'ring-2 ring-rose-500/20',
                isGuest && 'cursor-default active:scale-100 hover:bg-muted/50',
              )}
            >
              {/* Hunger Fill Background */}

              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 z-0 h-full origin-bottom',
                  animateHunger &&
                    'transition-transform duration-1000 ease-in-out',
                  hungerColor,
                )}
                style={{
                  transform: `scaleY(${hungerPercent / 100})`,
                  opacity: 0.2,
                }}
              />

              {/* Icon Container */}

              <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full shadow-sm bg-background ring-1 ring-black/5 shrink-0">
                <Fly
                  size={21}
                  y={-2}
                  className={cn(
                    'transition-transform duration-300 text-muted-foreground',
                    animateBalance && 'group-hover:rotate-12',
                  )}
                  paused={paused}
                />
              </div>

              <div className="relative z-10 flex flex-col justify-center">
                {/* Hunger Status - Integrated Line at the top */}

                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full ring-1 ring-white/10 shadow-sm',
                      hungerColor,
                    )}
                  />

                  <span
                    className={cn(
                      'text-[8px] font-black uppercase tracking-[0.15em]',

                      hungerTextColor,
                    )}
                  >
                    {hungerStatus}
                  </span>
                </div>

                <span className="text-xl font-black leading-none tracking-tight text-foreground tabular-nums">
                  {flyBalance}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-24" />
          )}
        </div>
        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Gift & Wardrobe Buttons */}
        {showActionButtons && (
          <div className="flex items-center gap-1.5">
            {onOpenProgressCoach && !isGuest && (
              <button
                onClick={onOpenProgressCoach}
                className="group relative flex items-center justify-center w-[44px] h-[44px] rounded-[13px]
                    bg-card/80 backdrop-blur-2xl
                    text-muted-foreground hover:text-primary
                    shadow-sm hover:shadow-md
                    border border-border/50
                    transition-all duration-300 ease-out
                    active:scale-95 active:translate-y-0.5"
                title="Progress Coach"
              >
                <div className="absolute inset-0 bg-primary/10 rounded-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Brain className="relative w-[18px] h-[18px] stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
                {!progressCoachIsPremium && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[8px] font-black text-primary-foreground shadow-sm">
                    PRO
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setQuestsOpen(true)}
              onPointerEnter={isGuest ? undefined : prefetchQuests}
              onFocus={isGuest ? undefined : prefetchQuests}
              onTouchStart={isGuest ? undefined : prefetchQuests}
              className="group relative flex items-center justify-center w-[44px] h-[44px] rounded-[13px]
                    bg-card/80 backdrop-blur-2xl
                    text-muted-foreground hover:text-primary
                    shadow-sm hover:shadow-md
                    border border-border/50
                    transition-all duration-300 ease-out
                    active:scale-95 active:translate-y-0.5"
              title="Quests"
            >
              <div className="absolute inset-0 bg-primary/10 rounded-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <ScrollText className="relative w-[18px] h-[18px] stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
              {questClaimableCount > 0 ? (
                <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full border-2 border-background shadow-sm z-20 animate-in zoom-in">
                  {questClaimableCount > 99 ? '99+' : questClaimableCount}
                </span>
              ) : questActiveCount > 0 ? (
                <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-muted-foreground/60 rounded-full border-2 border-background shadow-sm z-20">
                  {questActiveCount > 9 ? '9+' : questActiveCount}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => onOpenChange(true)}
              className="group relative flex items-center justify-center w-[44px] h-[44px] rounded-[13px]
                    bg-card/80 backdrop-blur-2xl
                    text-muted-foreground hover:text-primary
                    shadow-sm hover:shadow-md
                    border border-border/50
                    transition-all duration-300 ease-out
                    active:scale-95 active:translate-y-0.5"
              title="Open Wardrobe"
            >
              <div className="absolute inset-0 bg-primary/10 rounded-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Shirt className="relative w-[18px] h-[18px] stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
              {wardrobeBadge > 0 && (
                <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background shadow-sm z-20">
                  {wardrobeBadge > 9 ? '9+' : wardrobeBadge}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      <QuestsPopup
        show={isQuestsOpen}
        onClose={() => setQuestsOpen(false)}
        isGuest={isGuest}
        onQuestsChanged={onQuestsChanged}
      />

      <WardrobePanel open={openWardrobe} onOpenChange={onOpenChange} />
    </div>
  );
}
