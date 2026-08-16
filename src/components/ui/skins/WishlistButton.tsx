'use client';

import { motion } from 'framer-motion';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTick } from '@/lib/haptics';

export function WishlistButton({
  count,
  readyCount,
  onClick,
}: {
  count: number;
  readyCount: number;
  onClick: () => void;
}) {
  const hot = readyCount > 0;
  return (
    <button
      type="button"
      data-hint="wardrobe-wishlist"
      aria-label={
        hot
          ? `Wishlist, ${readyCount} ready to buy`
          : count > 0
            ? `Wishlist, ${count} saved`
            : 'Wishlist'
      }
      onClick={() => {
        hapticTick();
        onClick();
      }}
      className={cn(
        'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm backdrop-blur-md transition-colors',
        hot
          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
          : 'border-border/50 bg-card/50 text-muted-foreground hover:bg-accent/50',
      )}
    >
      <Bookmark
        className="h-5 w-5"
        strokeWidth={2.5}
        fill={count > 0 ? 'currentColor' : 'none'}
      />
      {count > 0 && (
        <motion.span
          key={`${count}|${hot}`}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          className={cn(
            'absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums shadow-sm',
            hot
              ? 'bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.18)]'
              : 'border border-border/60 bg-background text-muted-foreground',
          )}
        >
          {count}
        </motion.span>
      )}
    </button>
  );
}
