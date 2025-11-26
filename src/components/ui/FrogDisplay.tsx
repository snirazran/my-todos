'use client';

import React from 'react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';
import { Shirt } from 'lucide-react';
import type { WardrobeSlot } from '@/lib/skins/catalog';

type Props = {
  frogRef: React.RefObject<FrogHandle>;
  frogBoxRef?: React.RefObject<HTMLDivElement>;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number };
  indices?: Partial<Record<WardrobeSlot, number>>;
  openWardrobe: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
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
}: Props) {
  return (
    <div className={className}>
      <div ref={frogBoxRef} className="relative z-10">
        <Frog
          ref={frogRef}
          mouthOpen={!!mouthOpen}
          mouthOffset={mouthOffset}
          indices={indices}
        />
        <button
          onClick={() => onOpenChange(true)}
          className="absolute p-2 rounded-full shadow right-2 top-2 bg-white/80 hover:shadow-md dark:bg-slate-800"
          title="Wardrobe"
        >
          <Shirt className="w-5 h-5" />
        </button>
      </div>
      <WardrobePanel open={openWardrobe} onOpenChange={onOpenChange} />
    </div>
  );
}
