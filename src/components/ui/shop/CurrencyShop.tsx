'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { Sparkles, X, ShieldCheck } from 'lucide-react';

const PACKS = [
  {
    id: 'handful',
    name: 'Handful of Flies',
    amount: 10,
    price: '$0.99',
    giftCount: 1,
    bgGradient: 'bg-gradient-to-br from-emerald-500/20 to-emerald-900/40',
    raysColor: 'text-emerald-500',
    badgeClass: 'bg-emerald-500 text-white',
    btnClass: 'bg-emerald-600 text-white border-emerald-800 hover:bg-emerald-500',
  },
  {
    id: 'jar',
    name: 'Jar of Flies',
    amount: 50,
    price: '$3.99',
    giftCount: 3,
    bgGradient: 'bg-gradient-to-br from-violet-500/20 to-purple-900/40',
    raysColor: 'text-violet-500',
    badge: 'Popular',
    badgeClass: 'bg-violet-500 text-white',
    btnClass: 'bg-violet-600 text-white border-violet-800 hover:bg-violet-500',
  },
  {
    id: 'crate',
    name: 'Crate of Flies',
    amount: 100,
    price: '$6.99',
    giftCount: 5,
    bgGradient: 'bg-gradient-to-br from-amber-500/20 to-amber-900/40',
    raysColor: 'text-amber-500',
    badge: 'Best Value',
    badgeClass: 'bg-amber-500 text-amber-950',
    btnClass: 'bg-amber-500 text-amber-950 border-amber-700 hover:bg-amber-400',
  },
];

interface CurrencyShopProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  hunger: number;
  maxHunger: number;
}

export function CurrencyShop({
  open,
  onOpenChange,
  balance,
  hunger,
  maxHunger,
}: CurrencyShopProps) {
  const hungerPercent =
    typeof hunger === 'number' && typeof maxHunger === 'number' && maxHunger > 0
      ? Math.max(0, Math.min(100, (hunger / maxHunger) * 100))
      : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden border-none bg-transparent shadow-none w-full sm:max-w-[95vw] md:max-w-5xl">
        <div className="relative flex flex-col w-full bg-background border border-border shadow-2xl rounded-[32px] overflow-hidden max-h-[90vh]">
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

          <DialogClose className="absolute right-4 top-4 z-50 p-2 rounded-full bg-background/50 hover:bg-muted transition-colors border border-border/40 shadow-sm backdrop-blur-sm">
            <X className="w-4 h-4 text-foreground" />
          </DialogClose>

          <div className="relative z-10 px-6 pt-6 pb-2 shrink-0 text-center">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-3xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
                  Fly Shop
                </span>
                <Sparkles className="w-5 h-5 text-amber-400 fill-amber-400 animate-pulse" />
              </DialogTitle>
            </DialogHeader>

            <div className="inline-flex items-center gap-4 p-2 pl-4 pr-4 rounded-full bg-card border border-border/60 shadow-sm mx-auto">
              <div className="flex items-center gap-2">
                 <div className="w-5 h-5 flex items-center justify-center">
                    <Fly size={20} y={-2} paused={false} />
                 </div>
                 <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                   Balance
                 </span>
                 <span className="text-sm font-black text-foreground tabular-nums leading-none">
                   {balance}
                 </span>
              </div>
              <div className="h-3 w-[1px] bg-border" />
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                   Hunger
                 </span>
                 <span className={cn("text-xs font-black tabular-nums", 
                    hungerPercent > 80 ? 'text-emerald-500' :
                    hungerPercent > 60 ? 'text-lime-500' :
                    hungerPercent > 40 ? 'text-yellow-500' :
                    hungerPercent > 20 ? 'text-amber-500' :
                    'text-rose-500'
                 )}>
                   {Math.round(hungerPercent)}%
                 </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar px-6 pb-8 pt-2 flex flex-row gap-4 snap-x snap-mandatory md:justify-center">
            {PACKS.map((pack) => {
              const isJar = pack.id === 'jar';
              const isCrate = pack.id === 'crate';
              
              return (
                <button
                  key={pack.id}
                  className={cn(
                    "group relative flex flex-col shrink-0 w-[75vw] sm:w-[260px] p-2 rounded-[32px] border transition-all duration-300 active:scale-[0.98] overflow-hidden text-center snap-center",
                    isCrate 
                      ? "bg-gradient-to-b from-amber-500/10 to-transparent border-amber-500/50 shadow-xl hover:shadow-2xl hover:border-amber-500 hover:-translate-y-1" 
                      : isJar
                      ? "bg-gradient-to-b from-violet-500/10 to-transparent border-violet-500/50 shadow-lg hover:shadow-xl hover:border-violet-500 hover:-translate-y-1"
                      : "bg-card border-border hover:border-emerald-500/40 hover:bg-muted/30 shadow-md hover:-translate-y-1"
                  )}
                  onClick={() => {}}
                >
                  <div className="flex flex-col items-center justify-center w-full px-2 pt-3 pb-2 gap-1.5 h-14">
                     {pack.badge && (
                        <div className={cn(
                           "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm whitespace-nowrap",
                           pack.badgeClass
                        )}>
                           {pack.badge}
                        </div>
                     )}
                     <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center line-clamp-1">
                       {pack.name}
                     </span>
                  </div>

                  {/* HERO VISUAL AREA */}
                  <div className="relative w-full aspect-[4/3] flex flex-col items-center justify-center mb-4 mt-2 overflow-hidden rounded-[20px]">
                     {/* 1. Base Gradient */}
                     <div className={cn("absolute inset-0 opacity-100", pack.bgGradient)} />

                     {/* 2. Kinetic Background (Universal Rays) - On top of gradient for visibility */}
                     <div className="absolute inset-[-50%] opacity-40 pointer-events-none">
                        <RotatingRays colorClass={pack.raysColor} />
                     </div>
                     
                     {/* 3. The Loot Cluster - Perfect Text Alignment */}
                     <div className="relative z-10 w-full h-full flex items-center justify-center gap-0">
                        
                        {/* Flies Group */}
                        <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                           <div className="w-20 h-24 flex items-center justify-center relative filter drop-shadow-xl">
                              <Fly size={60} y={-2} paused={false} />
                           </div>
                           <div className="flex flex-col items-center leading-tight">
                              <span className="text-xl font-black text-foreground tabular-nums drop-shadow-sm">
                                 {pack.amount}
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80">
                                 Flies
                              </span>
                           </div>
                        </div>

                        {/* Gift Group */}
                        {pack.giftCount > 0 && (
                           <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                                <div className="w-20 h-24 flex items-center justify-center relative filter drop-shadow-xl -translate-y-3">
                                   <GiftRive width={96} height={96} />
                                </div>
                                <div className="flex flex-col items-center leading-tight">
                                   <span className="text-xl font-black text-rose-500 tabular-nums drop-shadow-sm">
                                      +{pack.giftCount}
                                   </span>
                                   <span className="text-[10px] font-bold text-rose-500/80 uppercase tracking-widest opacity-90">
                                      {pack.giftCount > 1 ? 'Gifts' : 'Gift'}
                                   </span>
                                </div>
                             </div>
                          )}
                       </div>
                    </div>

                    {/* Price Button (Bottom) - Redesigned without shine */}
                    <div className={cn(
                       "w-full py-3.5 rounded-2xl font-black text-base uppercase tracking-widest transition-all mt-auto relative shadow-md border-b-4 active:border-b-0 active:translate-y-1 active:shadow-inner",
                       pack.btnClass
                     )}>
                        <span className="relative z-10">{pack.price}</span>
                    </div>
                </button>
              );
            })}
          </div>

          <div className="px-6 pb-4 pt-2 text-center border-t border-border/40 bg-muted/20">
             <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground mb-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Secure Payment via App Store</span>
             </div>
             <p className="text-[9px] text-muted-foreground/40 font-medium">
                Purchases support the developer & keep the frog happy!
             </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
