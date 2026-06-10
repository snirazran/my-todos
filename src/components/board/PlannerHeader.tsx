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
    return (
      <button
        type="button"
        onClick={onToggle}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
      >
        <CalendarDays size={16} className="opacity-80" />
        <span className="text-sm font-semibold tracking-tight">
          {expanded ? 'Close' : 'Jump to date'}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="opacity-70" />
        ) : (
          <ChevronDown size={16} className="opacity-70" />
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
