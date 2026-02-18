'use client';

import React, { useRef } from 'react';
import {
  Sparkles,
  Crown,
  Shirt,
  Hand,
  Ghost,
  Ribbon,
  Gift,
  Glasses,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterCategory =
  | 'all'
  | 'container'
  | 'hat'
  | 'scarf'
  | 'body'
  | 'held'
  | 'glasses'
  | 'costume';

const CATEGORY_CONFIG: Record<
  FilterCategory,
  { label: string; icon: React.ReactNode }
> = {
  all: { label: 'All Items', icon: <Sparkles className="w-5 h-5" /> },
  container: { label: 'Gift Boxes', icon: <Gift className="w-5 h-5" /> },
  hat: { label: 'Hats', icon: <Crown className="w-5 h-5" /> },
  scarf: { label: 'Scarves', icon: <Ribbon className="w-5 h-5" /> },
  body: { label: 'Body', icon: <Shirt className="w-5 h-5" /> },
  held: { label: 'Held', icon: <Hand className="w-5 h-5" /> },
  glasses: { label: 'Glasses', icon: <Glasses className="w-5 h-5" /> },
  costume: { label: 'Costumes', icon: <Ghost className="w-5 h-5" /> },
};

export interface FilterOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export function FilterBar({
  active,
  onChange,
  badges,
  options,
}: {
  active: string;
  onChange: (s: any) => void;
  badges?: Partial<Record<string, number>>;
  options?: FilterOption[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag Logic Refs (No re-renders!)
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const isDragging = useRef(false);

  // Use provided options or default categories (mapped to FilterOption format)
  const displayOptions: FilterOption[] = options ?? [
    {
      id: 'all',
      label: CATEGORY_CONFIG.all.label,
      icon: CATEGORY_CONFIG.all.icon,
    },
    {
      id: 'hat',
      label: CATEGORY_CONFIG.hat.label,
      icon: CATEGORY_CONFIG.hat.icon,
    },
    {
      id: 'scarf',
      label: CATEGORY_CONFIG.scarf.label,
      icon: CATEGORY_CONFIG.scarf.icon,
    },
    {
      id: 'body',
      label: CATEGORY_CONFIG.body.label,
      icon: CATEGORY_CONFIG.body.icon,
    },
    {
      id: 'held',
      label: CATEGORY_CONFIG.held.label,
      icon: CATEGORY_CONFIG.held.icon,
    },
    {
      id: 'glasses',
      label: CATEGORY_CONFIG.glasses.label,
      icon: CATEGORY_CONFIG.glasses.icon,
    },
    {
      id: 'costume',
      label: CATEGORY_CONFIG.costume.label,
      icon: CATEGORY_CONFIG.costume.icon,
    },
  ];

  /* --- Mouse Event Handlers (Desktop Drag) --- */

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDown.current = true;
    isDragging.current = false; // Reset drag status
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
  };

  const onMouseLeave = () => {
    isDown.current = false;
    isDragging.current = false;
  };

  const onMouseUp = () => {
    isDown.current = false;
    // We don't reset isDragging immediately here,
    // so the onClick handler has time to check it.
    setTimeout(() => {
      isDragging.current = false;
    }, 0);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDown.current || !scrollRef.current) return;

    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;

    // 1. Calculate distance moved
    const walk = (x - startX.current) * 1; // 1:1 Speed (Fixed "Too Fast")

    // 2. Threshold Check (Fixed "Can't Click")
    // Only count as dragging if moved more than 5 pixels
    if (Math.abs(x - startX.current) > 5) {
      isDragging.current = true;
      scrollRef.current.scrollLeft = scrollLeft.current - walk;
    }
  };

  // Auto-scroll to active item on load
  React.useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [active]);

  return (
    <div className="relative w-full group">
      <div
        ref={scrollRef}
        // Bind Mouse Events
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        className={cn(
          // Layout
          'flex items-center gap-3 overflow-x-auto',
          // Mobile Layout (Full Bleed)
          '-mx-4 px-4 w-[calc(100%+2rem)] md:mx-0 md:px-0 md:w-full',
          // Scroll & Interaction
          'pb-2 touch-pan-x cursor-grab active:cursor-grabbing',
          // Hide Scrollbars
          'no-scrollbar',
        )}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {displayOptions.map((opt) => {
          const isActive = active === opt.id;
          const badgeCount = badges?.[opt.id] ?? 0;

          return (
            <button
              key={opt.id}
              data-active={isActive}
              // The Click Guard
              onClick={(e) => {
                if (isDragging.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onChange(opt.id);
              }}
              className={cn(
                'relative flex-none flex items-center gap-2 px-5 py-3 rounded-2xl transition-all duration-200 border-[2px] shadow-sm select-none',
                'text-sm font-bold whitespace-nowrap',
                isActive
                  ? 'bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/20 shadow-none'
                  : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {opt.icon}
              {opt.label}
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background shadow-sm animate-in zoom-in">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Spacer for mobile padding */}
        <div className="flex-none w-2 md:hidden" />
      </div>
    </div>
  );
}
