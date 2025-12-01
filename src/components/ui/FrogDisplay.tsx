'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Shirt, Sparkles } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';

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
}: Props) {
  return (
    // Added mb-12 to create the requested space from the tabs below
    <div className={`${className} flex flex-col items-center mb-6 md:mb-12 relative`}>
      {/* 0. THE AURA (Surprise Element) 
          A subtle glowing spotlight behind the frog to frame it.
      */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-violet-500/10 dark:bg-violet-400/10 blur-[60px] rounded-full pointer-events-none z-0" />

      {/* 1. THE FROG (Z-Index 20) */}
      <div
        ref={frogBoxRef}
        className="relative z-20 transition-transform duration-500 -translate-y-3.5 pointer-events-none "
      >
        <div className="pointer-events-auto">
          <Frog
            ref={frogRef}
            mouthOpen={!!mouthOpen}
            mouthOffset={mouthOffset}
            indices={indices}
          />
        </div>
      </div>

      {/* 2. THE CONTROL DECK 
          - Ceramic Glass Aesthetic
          - Subtle gradient border
      */}
      <div
        className="relative z-10 -mt-6 flex items-center justify-between 
        w-[340px] max-w-[92vw] h-[76px] px-3
        bg-gradient-to-b from-white/90 to-white/60 dark:from-slate-900/90 dark:to-slate-900/60
        backdrop-blur-2xl
        rounded-[24px]
        border border-white/50 dark:border-slate-700/50
        shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)]"
      >
        {/* Decorative Top Highlight to simulate glass edge light */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />

        {/* Left: Digital Fly Counter (Recessed Look) */}
        {typeof flyBalance === 'number' ? (
          <div className="group relative overflow-hidden flex items-center gap-3 pl-2.5 pr-5 py-2 h-[52px] rounded-[18px] bg-slate-100/50 dark:bg-slate-800/50 shadow-inner border border-slate-200/30 dark:border-slate-800 transition-all hover:bg-slate-100/80">
            {/* Icon Container with subtle glow */}
            <div className="relative flex items-center justify-center bg-white rounded-full shadow-sm w-9 h-9 dark:bg-slate-700 ring-1 ring-black/5">
              <Fly
                size={24}
                y={-2}
                className="transition-transform duration-300 text-slate-600 dark:text-slate-300 group-hover:rotate-12"
              />
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none mb-0.5">
                Balance
              </span>
              <span className="text-xl font-black leading-none text-slate-700 dark:text-slate-200 tabular-nums">
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
          className="group relative flex items-center justify-center w-[52px] h-[52px] rounded-[18px]
          bg-white dark:bg-slate-800
          text-slate-400 hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400
          shadow-[0_4px_10px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-4px_rgba(124,58,237,0.15)]
          border border-slate-100 dark:border-slate-700
          transition-all duration-300 ease-out
          active:scale-95 active:translate-y-0.5"
          title="Open Wardrobe"
        >
          <div className="absolute inset-0 bg-violet-50 dark:bg-violet-900/20 rounded-[18px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Shirt className="relative w-6 h-6 stroke-[2px] transition-transform duration-300 group-hover:scale-110" />
        </button>
      </div>

      <WardrobePanel open={openWardrobe} onOpenChange={onOpenChange} />
    </div>
  );
}
