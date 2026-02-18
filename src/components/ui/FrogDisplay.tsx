'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Shirt, Gift } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { CurrencyShop } from '@/components/ui/shop/CurrencyShop';
import { GiftHubPopup } from './GiftHubPopup';
import { useProgressLogic } from '@/hooks/useProgressLogic';

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
  giftsClaimed?: number;
  isCatching?: boolean;
  animateBalance?: boolean;
  animateHunger?: boolean;
  hunger?: number;
  maxHunger?: number;
  isGuest?: boolean;
  onAddTask?: () => void;
  onMutateToday?: () => void;
  onOpenDailyReward?: () => void;
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
  giftsClaimed,
  isCatching,
  animateBalance = true,
  animateHunger = true,
  hunger,
  maxHunger,
  isGuest,
  onAddTask,
  onMutateToday,
  onOpenDailyReward,
}: Props) {
  const { unseenCount, data: inventoryData } = useInventory();
  const [clickedAt, setClickedAt] = React.useState(0);
  const [shopOpen, setShopOpen] = React.useState(false);
  const [giftHubOpen, setGiftHubOpen] = React.useState(false);

  const progressSlots = useProgressLogic(
    done ?? 0,
    total ?? 0,
    giftsClaimed ?? 0,
  );
  const readyGifts = progressSlots.filter((s) => s.status === 'READY').length;
  const totalOwnedBoxes = React.useMemo(() => {
    const inv = inventoryData?.wardrobe?.inventory;
    const catalog = inventoryData?.catalog;
    if (!inv || !catalog) return 0;
    return catalog
      .filter((i) => i.slot === 'container')
      .reduce((sum, item) => sum + (inv[item.id] ?? 0), 0);
  }, [inventoryData]);
  const giftBadge = readyGifts + totalOwnedBoxes;

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
    if (!animateHunger || displayedHunger <= 0) return;

    const interval = setInterval(() => {
      setDisplayedHunger((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [displayedHunger]);

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
      className={`${className} flex flex-col items-center mb-6 md:mb-12 relative`}
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
        className="relative z-50 transition-transform duration-500 -translate-y-3.5 pointer-events-none "
      >
        <div
          className="pointer-events-auto cursor-pointer"
          onClick={() => setClickedAt(Date.now())}
        >
          <Frog
            ref={frogRef}
            mouthOpen={!!mouthOpen}
            mouthOffset={mouthOffset}
            indices={indices}
          />
        </div>

        {/* SPEECH BUBBLE - NOW INSIDE FROG'S CONTAINER */}

        {typeof rate === 'number' &&
          typeof done === 'number' &&
          typeof total === 'number' &&
          typeof giftsClaimed === 'number' && (
            <FrogSpeechBubble
              rate={rate}
              done={done}
              total={total}
              giftsClaimed={giftsClaimed}
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

              w-[370px] max-w-[95vw] h-[76px] px-3

              bg-card/80

              backdrop-blur-2xl

              rounded-[20px]

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
                'group relative overflow-hidden flex items-center gap-3 pl-2.5 pr-5 py-2 h-[60px] rounded-[18px] bg-muted/50 shadow-inner border border-border/30 transition-all cursor-pointer active:scale-95 duration-200',
                !isGuest && 'hover:bg-muted/80',
                hungerPercent <= 20 && 'ring-2 ring-rose-500/20',
                isGuest && 'cursor-default active:scale-100 hover:bg-muted/50',
              )}
            >
              {/* Hunger Fill Background */}

              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 z-0',
                  animateHunger && 'transition-all duration-1000 ease-in-out',
                  hungerColor,
                )}
                style={{ height: `${hungerPercent}%`, opacity: 0.2 }}
              />

              {/* Icon Container */}

              <div className="relative z-10 flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 shrink-0">
                <Fly
                  size={24}
                  y={-2}
                  className={cn(
                    'transition-transform duration-300 text-muted-foreground',
                    animateBalance && 'group-hover:rotate-12',
                  )}
                />
              </div>

              <div className="relative z-10 flex flex-col justify-center">
                {/* Hunger Status - Integrated Line at the top */}

                <div className="flex items-center gap-1.5 mb-1">
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

                <span className="text-2xl font-black leading-none text-foreground tabular-nums tracking-tight">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGiftHubOpen(true)}
            className="group relative flex items-center justify-center w-[52px] h-[52px] rounded-[15px]
                    bg-card/80 backdrop-blur-2xl
                    text-muted-foreground hover:text-primary
                    shadow-sm hover:shadow-md
                    border border-border/50
                    transition-all duration-300 ease-out
                    active:scale-95 active:translate-y-0.5"
            title="Gift Center"
          >
            <div className="absolute inset-0 bg-primary/10 rounded-[15px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Gift className="relative w-5 h-5 stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
            {giftBadge > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-primary-foreground bg-primary rounded-full border-2 border-background shadow-sm z-20">
                {giftBadge > 9 ? '9+' : giftBadge}
              </span>
            )}
          </button>

          <button
            onClick={() => onOpenChange(true)}
            className="group relative flex items-center justify-center w-[52px] h-[52px] rounded-[15px]
                    bg-card/80 backdrop-blur-2xl
                    text-muted-foreground hover:text-primary
                    shadow-sm hover:shadow-md
                    border border-border/50
                    transition-all duration-300 ease-out
                    active:scale-95 active:translate-y-0.5"
            title="Open Wardrobe"
          >
            <div className="absolute inset-0 bg-primary/10 rounded-[15px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Shirt className="relative w-5 h-5 stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
            {unseenCount > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background shadow-sm z-20">
                {unseenCount > 9 ? '9+' : unseenCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <GiftHubPopup
        show={giftHubOpen}
        onClose={() => setGiftHubOpen(false)}
        done={done ?? 0}
        total={total ?? 0}
        giftsClaimed={giftsClaimed ?? 0}
        flyBalance={flyBalance ?? 0}
        onAddTask={onAddTask ?? (() => {})}
        onMutateToday={onMutateToday ?? (() => {})}
        isGuest={isGuest}
        onOpenDailyReward={onOpenDailyReward}
      />

      <WardrobePanel open={openWardrobe} onOpenChange={onOpenChange} />
    </div>
  );
}
