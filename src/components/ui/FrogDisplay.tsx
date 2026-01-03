'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Shirt, Sparkles } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { useInventory } from '@/hooks/useInventory';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

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
  hunger,
  maxHunger,
}: Props) {
  const { data: session } = useSession();
  const { unseenCount } = useInventory();
  const [clickedAt, setClickedAt] = React.useState(0);
  
  const hungerPercent = (typeof hunger === 'number' && typeof maxHunger === 'number') 
    ? Math.max(0, Math.min(100, (hunger / maxHunger) * 100)) 
    : 100;

  return (
    // Added mb-12 to create the requested space from the tabs below
    <div className={`${className} flex flex-col items-center mb-6 md:mb-12 relative`}>
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

        {/* Left: Digital Fly Counter (Recessed Look) */}
        {typeof flyBalance === 'number' ? (
          <div 
             className="group relative overflow-hidden flex items-center gap-3 pl-2.5 pr-5 py-2 h-[52px] rounded-[15px] bg-muted/50 shadow-inner border border-border/30 transition-all hover:bg-muted/80"
             title={`Hunger Level: ${Math.round(hungerPercent)}%`}
          >
            {/* Icon Container with subtle glow and hunger fill */}
            <div className="relative flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 overflow-hidden">
              {/* Hunger Fill */}
              <div 
                className="absolute bottom-0 left-0 right-0 bg-emerald-400/30 transition-all duration-1000 ease-in-out"
                style={{ height: `${hungerPercent}%` }}
              />
              
              <Fly
                size={24}
                y={-2}
                className={cn("relative z-10 transition-transform duration-300 text-muted-foreground", animateBalance && "group-hover:rotate-12")}
              />
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-0.5">
                Balance
              </span>
              <span className="text-xl font-black leading-none text-foreground tabular-nums">
                {flyBalance}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-24" />
        )}

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
