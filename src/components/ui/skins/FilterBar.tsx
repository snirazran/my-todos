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
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterCategory =
  | 'all'
  | 'container'
  | 'hat'
  | 'scarf'
  | 'body'
  | 'held'
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
  costume: { label: 'Costumes', icon: <Ghost className="w-5 h-5" /> },
};

export function FilterBar({
  active,
  onChange,
  badges,
}: {
  active: FilterCategory;
  onChange: (s: FilterCategory) => void;
  badges?: Partial<Record<FilterCategory, number>>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag Logic Refs (No re-renders!)
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const isDragging = useRef(false);

  const categories: FilterCategory[] = [
    'all',
    'container',
    'hat',
    'scarf',
    'body',
    'held',
    'costume',
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
          'no-scrollbar'
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

        {categories.map((cat) => {
          const conf = CATEGORY_CONFIG[cat];
          const isActive = active === cat;
          const badgeCount = badges?.[cat] ?? 0;
          
          return (
            <button
              key={cat}
              data-active={isActive}
              // The Click Guard
              onClick={(e) => {
                if (isDragging.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onChange(cat);
              }}
              className={cn(
                'relative flex-none flex items-center gap-2 px-5 py-3 rounded-2xl transition-all duration-200 border-[2px] shadow-sm select-none',
                'text-sm font-bold whitespace-nowrap',
                isActive
                  ? 'bg-primary border-primary text-primary-foreground shadow-primary/30'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-primary'
              )}
            >
              {conf.icon}
              {conf.label}
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
