'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ItemDef } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { cn } from '@/lib/utils';
import { Minus, Plus } from 'lucide-react';

const RARITY_CONFIG: Record<
  ItemDef['rarity'],
  {
    border: string;
    gradient: string;
    shadow: string;
    label: string;
    text: string;
    bg: string;
  }
> = {
  common: {
    border: 'border-border',
    gradient: 'from-muted/50 to-muted/20',
    shadow: 'shadow-sm',
    label: 'Common',
    text: 'text-muted-foreground',
    bg: 'bg-card',
  },
  uncommon: {
    border: 'border-emerald-500',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-500/15',
    label: 'Uncommon',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  rare: {
    border: 'border-sky-500',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-sky-500/15',
    label: 'Rare',
    text: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
  },
  epic: {
    border: 'border-violet-500',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-violet-500/20',
    label: 'Epic',
    text: 'text-violet-700 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
  },
  legendary: {
    border: 'border-amber-500',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-amber-500/25',
    label: 'Legendary',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
};

interface SellConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  item: ItemDef | null;
  ownedCount: number;
}

export function SellConfirmationDialog({
  open,
  onClose,
  onConfirm,
  item,
  ownedCount,
}: SellConfirmationDialogProps) {
  const [quantity, setQuantity] = useState(1);

  // Reset quantity when dialog opens with a new item
  useEffect(() => {
    if (open) setQuantity(1);
  }, [open, item]);

  if (!item) return null;

  const singleRefund = Math.floor((item.priceFlies ?? 0) / 2);
  const totalRefund = singleRefund * quantity;
  const rarityConfig = RARITY_CONFIG[item.rarity];

  const previewIndices = {
    skin: 0,
    hat: 0,
    scarf: 0,
    hand_item: 0,
    glasses: 0,
    mood: 0,
    [item.slot]: item.riveIndex,
  };

  const handleAdjust = (delta: number) => {
    setQuantity((prev) => Math.max(1, Math.min(ownedCount, prev + delta)));
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="z-[2000] sm:max-w-[400px] border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl rounded-3xl">
        <DialogHeader className="flex flex-col items-center gap-1 text-center">
          <DialogTitle className="text-2xl font-black tracking-tight">
            Sell Item?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You are about to sell this item. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Item Preview Card (Smaller box as requested) */}
        <div className="flex flex-col items-center justify-center my-4">
          <div className={cn(
            "relative w-32 h-32 aspect-square rounded-[24px] bg-gradient-to-b border-[3px] shadow-inner overflow-hidden flex items-center justify-center group shrink-0",
            rarityConfig.border,
            rarityConfig.gradient,
            rarityConfig.shadow
          )}>
             {/* Rarity Badge */}
             <div className={cn(
               "absolute top-0 left-0 px-2 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-wider border-b border-r z-20",
               rarityConfig.bg,
               rarityConfig.text,
               rarityConfig.border
             )}>
               {rarityConfig.label}
             </div>
             
             <div className="absolute top-0 w-1/2 h-full -skew-x-12 pointer-events-none -inset-full bg-gradient-to-r from-transparent to-white/20 dark:to-white/10 opacity-50" />
             
             <div className="absolute inset-0 z-10 flex items-end justify-center">
              {item.slot === 'container' ? (
                <div className="w-[80%] h-[80%] mb-4 drop-shadow-xl">
                   <GiftRive />
                </div>
              ) : (
                <Frog
                  className="w-[120%] h-[120%] object-contain translate-y-[10%]"
                  indices={previewIndices}
                  width={140}
                  height={140}
                />
              )}
            </div>
             
             {/* Quantity Badge on Preview */}
             {quantity > 1 && (
               <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                 x{quantity}
               </div>
             )}
          </div>

          {/* Item Name (Moved outside box) */}
          <div className="mt-3 text-lg font-bold text-foreground">
            {item.name}
          </div>
        </div>

        {/* Quantity Selector */}
        {ownedCount > 1 && (
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-border/60"
              onClick={() => handleAdjust(-1)}
              disabled={quantity <= 1}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <div className="text-lg font-black w-8 text-center tabular-nums">
              {quantity}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-border/60"
              onClick={() => handleAdjust(1)}
              disabled={quantity >= ownedCount}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <div className="text-xs text-muted-foreground ml-2 font-medium">
              / {ownedCount} owned
            </div>
          </div>
        )}

        {/* Refund Calculation (Bigger Fly) */}
        <div className="flex flex-col items-center justify-center gap-1 mb-6">
          <span className="text-sm font-medium text-muted-foreground">Total Refund</span>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-2xl">
             <span className="text-xl font-black">+</span>
             <Fly size={32} paused={false} y={-5} />  {/* Bigger Fly */}
             <span className="text-3xl font-black tracking-tight tabular-nums">{totalRefund}</span>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:justify-center sm:gap-3">
           <Button 
            size="lg" 
            variant="destructive" 
            onClick={() => onConfirm(quantity)}
            className="w-full text-base font-bold shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all rounded-xl"
            disabled={!item}
          >
            Confirm Sale
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={onClose}
            className="w-full text-base font-bold rounded-xl"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
