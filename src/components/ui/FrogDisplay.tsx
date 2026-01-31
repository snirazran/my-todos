'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Shirt, Sparkles } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { CurrencyShop } from '@/components/ui/shop/CurrencyShop';

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
}: Props) {
  const { unseenCount } = useInventory();
  const [clickedAt, setClickedAt] = React.useState(0);
  const [shopOpen, setShopOpen] = React.useState(false);

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
    if (displayedHunger <= 0) return;

    const interval = setInterval(() => {
      setDisplayedHunger(prev => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [displayedHunger]);

  const hungerPercent = (typeof displayedHunger === 'number' && typeof maxHunger === 'number')
    ? Math.max(0, Math.min(100, (displayedHunger / maxHunger) * 100))
    : 100;

  // Expanded hunger states for better transition
  const getHungerState = (p: number) => {
    if (p > 80) return { bg: 'bg-emerald-500', text: 'text-emerald-500', label: 'FULL TUMMY' };
    if (p > 60) return { bg: 'bg-lime-500', text: 'text-lime-500', label: 'HAPPY' };
    if (p > 40) return { bg: 'bg-yellow-500', text: 'text-yellow-500', label: 'PECKISH' };
    if (p > 20) return { bg: 'bg-amber-500', text: 'text-amber-500', label: 'GRUMPY' };
    return { bg: 'bg-rose-500', text: 'text-rose-500', label: 'HANGRY!!' };
  };

  const { bg: hungerColor, text: hungerTextColor, label: hungerStatus } = getHungerState(hungerPercent);



  return (

    // Added mb-12 to create the requested space from the tabs below

    <div className={`${className} flex flex-col items-center mb-6 md:mb-12 relative`}>

      <CurrencyShop

        open={shopOpen}

        onOpenChange={setShopOpen}

        balance={flyBalance ?? 0}

        hunger={displayedHunger}

        maxHunger={maxHunger ?? 100}

      />



      <div

        ref={frogBoxRef}

        className="relative z-20 transition-transform duration-500 -translate-y-3.5 pointer-events-none "

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

        {typeof rate === 'number' && typeof done === 'number' && typeof total === 'number' && typeof giftsClaimed === 'number' && (

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

              w-[340px] max-w-[92vw] h-[76px] px-3

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

              onClick={() => setShopOpen(true)}

              className={cn(

                "group relative overflow-hidden flex items-center gap-3 pl-2.5 pr-5 py-2 h-[60px] rounded-[18px] bg-muted/50 shadow-inner border border-border/30 transition-all hover:bg-muted/80 cursor-pointer active:scale-95 duration-200",

                hungerPercent <= 20 && "ring-2 ring-rose-500/20"

              )}

            >

              {/* Hunger Fill Background */}

              <div

                className={cn("absolute bottom-0 left-0 right-0 z-0 opacity-20", animateHunger && "transition-all duration-1000 ease-in-out", hungerColor)}

                style={{ height: `${hungerPercent}%` }}

              />



              {/* Icon Container */}

              <div className="relative z-10 flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 shrink-0">

                <Fly

                  size={24}

                  y={-2}

                  className={cn("transition-transform duration-300 text-muted-foreground", animateBalance && "group-hover:rotate-12")}

                />

              </div>



              <div className="relative z-10 flex flex-col justify-center">

                {/* Hunger Status - Integrated Line at the top */}

                <div className="flex items-center gap-1.5 mb-1">

                  <div className={cn("w-1.5 h-1.5 rounded-full ring-1 ring-white/10 shadow-sm", hungerColor)} />

                  <span className={cn(

                    "text-[8px] font-black uppercase tracking-[0.15em]",

                    hungerTextColor

                  )}>

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

        {/* Center: Invisible Grip Area for Frog Paws */}
        <div className="flex-1" />

        {/* Right: Wardrobe Button (Floating Key Look) */}
        {/* Center: Invisible Grip Area for Frog Paws */}
        <div className="flex-1" />

        {/* Right: Wardrobe Button (Floating Key Look) */}
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
          <Shirt className="relative w-6 h-6 stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
          {unseenCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm z-20">
              {unseenCount > 9 ? '9+' : unseenCount}
            </span>
          )}
        </button>      </div>

      <WardrobePanel open={openWardrobe} onOpenChange={onOpenChange} />
    </div>
  );
}
