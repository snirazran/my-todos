'use client';

import React from 'react';
import { ChevronUp, ChevronDown, CalendarDays } from 'lucide-react';
import { parseYmd, todayYmd, addDays } from './helpers';

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

  const today = todayYmd();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const d = parseYmd(dateKey);
  const monthDay = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const label =
    dateKey === today
      ? `Today, ${monthDay}`
      : dateKey === yesterday
        ? `Yesterday, ${monthDay}`
        : dateKey === tomorrow
          ? `Tomorrow, ${monthDay}`
          : monthDay;

  return (
    <button
      type="button"
      data-hint="planner-date"
      aria-expanded={expanded}
      onClick={onToggle}
      className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-card/40 backdrop-blur-xl text-foreground"
    >
      <span className="text-sm font-semibold tracking-tight leading-none">{label}</span>
      {expanded ? (
        <ChevronUp size={16} className="opacity-70" />
      ) : (
        <ChevronDown size={16} className="opacity-70" />
      )}
    </button>
  );
}
