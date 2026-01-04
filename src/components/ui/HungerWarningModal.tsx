'use client';

import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Frog from '@/components/ui/frog';
import type { WardrobeSlot } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { Utensils } from 'lucide-react';

interface Props {
  stolenFlies: number;
  onAcknowledge: () => void;
  open: boolean;
  indices?: Partial<Record<WardrobeSlot, number>>;
}

export function HungerWarningModal({ stolenFlies, onAcknowledge, open, indices }: Props) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onAcknowledge()}>
      <DialogContent className="sm:max-w-[360px] border-none bg-transparent shadow-none p-0 outline-none">
        <div className="relative flex flex-col items-center bg-card/95 backdrop-blur-2xl border border-border/60 rounded-[32px] p-6 shadow-2xl overflow-hidden ring-1 ring-black/5">
          
          {/* Header: Frog + Icon */}
          <div className="relative mb-4 mt-2 scale-110">
             <Frog width={200} height={150} indices={indices} className="drop-shadow-sm" />
             <div className="absolute -right-2 -top-1 bg-rose-500 text-white p-2.5 rounded-full shadow-lg border-[3px] border-card animate-in zoom-in duration-300">
                <Utensils className="w-5 h-5" strokeWidth={3} />
             </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-foreground tracking-tight mb-1 text-center">
            I was Starving!
          </h2>
          
          {/* Explanation */}
          <p className="text-sm text-muted-foreground font-medium text-center mb-6 px-4 leading-relaxed">
            I got too hungry and had to snack on your stash while you were away.
          </p>

          {/* The "Bill" / Loss Visual */}
          <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-6 flex items-center justify-center gap-4">
             <div className="relative opacity-80 -top-2">
                <Fly size={52} className="text-rose-600 grayscale brightness-75" />
                {/* Cross out the fly */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-600 -rotate-45 rounded-full" />
             </div>
             <span className="text-3xl font-black text-rose-600 tabular-nums tracking-tight">
               -{stolenFlies}
             </span>
          </div>

          {/* Action */}
          <Button 
            onClick={onAcknowledge}
            className="w-full h-12 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            I'll Do My Tasks
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
}