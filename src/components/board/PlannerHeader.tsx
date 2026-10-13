'use client';

import React from 'react';
import { ChevronUp, ChevronDown, CalendarDays } from 'lucide-react';
import { parseYmd } from './helpers';

export default function PlannerHeader({
  dateKey,
  expanded,
  onToggle,
  variant = 'mobile',
}: {
  dateKey: string;
  expanded: boolean;
  onToggle: () => void;
  /** 'mobile' shows the active date; 'desktop' shows a static "Open calendar" button. */
  variant?: 'mobile' | 'desktop';
}) {
  if (variant === 'desktop') {
    const monthLabel = parseYmd(dateKey).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    return (
      <button
        type="button"
        data-hint="planner-date"
        aria-expanded={expanded}
        aria-label={expanded ? 'Close calendar' : `Jump to date, showing ${monthLabel}`}
        title="Jump to date"
        onClick={onToggle}
        className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-3 text-foreground transition-colors hover:bg-muted"
      >
        <CalendarDays size={16} className="text-primary" />
        <span className="min-w-[8.5rem] text-center text-sm font-black tracking-tight">
          {expanded ? 'Close' : monthLabel}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="opacity-60" />
        ) : (
          <ChevronDown size={16} className="opacity-60" />
        )}
      </button>
    );
  }

  const monthLabel = parseYmd(dateKey).toLocaleString('en-US', {
    month: 'long',
  });
  const yearLabel = parseYmd(dateKey).getFullYear();

  return (
    <button
      type="button"
      data-hint="planner-date"
      aria-expanded={expanded}
      aria-label={expanded ? 'Close calendar' : `Open calendar, ${monthLabel} ${yearLabel}`}
      onClick={onToggle}
      className="pointer-events-auto -ml-1.5 flex h-9 items-center gap-1 rounded-xl px-1.5 text-foreground transition-colors active:bg-muted/60"
    >
      <span className="text-[17px] font-extrabold leading-none tracking-tight">
        {monthLabel}
      </span>
      <span className="text-[17px] font-extrabold leading-none tracking-tight text-muted-foreground/45">
        {yearLabel}
      </span>
      <ChevronDown
        size={16}
        strokeWidth={2.75}
        className={`text-muted-foreground/70 transition-transform duration-200 ${
          expanded ? 'rotate-180' : ''
        }`}
      />
    </button>
  );
}
