'use client';

import React from 'react';
import { Check, Lock, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAG_COLORS } from './constants';

export const TINT = {
  sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  teal: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  neutral: 'bg-foreground/[0.07] text-muted-foreground',
} as const;

export type Tint = keyof typeof TINT;

export const PRIMARY_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#447d3f] text-[15px] font-black text-white shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40 transition-all active:translate-y-1 active:shadow-none [@media(hover:hover)]:hover:-translate-y-px [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none';

export const SECONDARY_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-muted/60 text-[15px] font-black text-foreground transition-colors active:bg-muted [@media(hover:hover)]:hover:bg-muted';

export const DANGER_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 text-[15px] font-black text-white shadow-[0_4px_0_0_#9f1239] transition-all active:translate-y-1 active:shadow-none [@media(hover:hover)]:hover:bg-rose-600';

export const FIELD_TILE =
  'rounded-2xl bg-muted/50 transition-[background-color,box-shadow] focus-within:bg-muted/70 focus-within:ring-2 focus-within:ring-primary/25';

export const SHEET_TITLE = 'text-[17px] font-black tracking-tight text-foreground';

export function Squircle({
  tint,
  size = 'md',
  className,
  children,
}: {
  tint: Tint;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'sm' && 'h-7 w-7 rounded-lg',
        size === 'md' && 'h-8 w-8 rounded-xl',
        size === 'lg' && 'h-9 w-9 rounded-xl',
        TINT[tint],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function KitSection({
  icon,
  tint,
  title,
  aside,
  className,
  children,
}: {
  icon: React.ReactNode;
  tint: Tint;
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl bg-muted/50 p-1.5', className)}>
      <div className="flex h-9 items-center gap-2 pl-1 pr-2">
        <Squircle tint={tint} size="sm">
          {icon}
        </Squircle>
        <span className="min-w-0 truncate text-[14px] font-black text-foreground">
          {title}
        </span>
        {aside && <span className="ml-auto shrink-0">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function SwatchGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2 rounded-xl bg-card p-2.5">
      {TAG_COLORS.map((c) => {
        const active = value === c.value;
        return (
          <button
            key={c.name}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={active}
            onClick={() => onChange(c.value)}
            className={cn(
              'grid aspect-square w-full place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform active:scale-90',
              c.bg,
              active ? 'scale-105 ring-2 ring-foreground/70' : '',
            )}
          >
            {active && <Check className="h-4 w-4 text-white" strokeWidth={3.5} />}
          </button>
        );
      })}
    </div>
  );
}

export function AreaOption({
  label,
  accent,
  picked,
  locked = false,
  badge,
  disabled,
  onClick,
}: {
  label: string;
  accent?: string;
  picked: boolean;
  locked?: boolean;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={picked}
      className={cn(
        'inline-flex h-10 min-w-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-[transform,background-color,box-shadow] active:scale-95 disabled:opacity-60',
        picked
          ? 'bg-primary/10 text-primary ring-[1.5px] ring-inset ring-primary/45'
          : 'bg-card text-foreground shadow-[0_1px_0_0_rgba(15,23,42,0.06)] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.3)]',
      )}
    >
      {picked ? (
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
      ) : locked ? (
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.75} />
      ) : accent ? (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      ) : null}
      <span className="truncate">{label}</span>
      {badge && (
        <span
          className="rounded-md px-1.5 py-0.5 text-[8.5px] font-black tracking-[0.12em] text-white"
          style={{ backgroundColor: accent || '#22c55e' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function luminance(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const channel = (start: number) => {
    const value = parseInt(clean.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function inkOn(hex: string) {
  return luminance(hex) > 0.42 ? '#1f2a1d' : '#ffffff';
}

export type TagPillState = {
  color: string;
  selected?: boolean;
  partial?: boolean;
  locked?: boolean;
  suggest?: boolean;
  size?: 'sm' | 'md';
};

export function tagPillProps({
  color,
  selected = false,
  partial = false,
  locked = false,
  suggest = false,
  size = 'md',
}: TagPillState): { className: string; style?: React.CSSProperties } {
  const base = cn(
    'relative inline-flex max-w-full shrink-0 select-none items-center gap-1.5 rounded-full border-[1.5px] font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-150 active:scale-95',
    size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-[13.5px]',
  );
  if (locked) {
    return {
      className: cn(base, 'border-dashed border-border bg-transparent text-muted-foreground/70'),
    };
  }
  if (suggest || partial) {
    return {
      className: cn(base, 'border-dashed'),
      style: {
        borderColor: `${color}80`,
        backgroundColor: `${color}12`,
        color,
      },
    };
  }
  if (selected) {
    return {
      className: cn(base, 'shadow-[0_2px_0_0_rgba(15,23,42,0.16)]'),
      style: { backgroundColor: color, borderColor: color, color: inkOn(color) },
    };
  }
  return {
    className: cn(
      base,
      'border-transparent bg-muted/60 text-foreground/85 [@media(hover:hover)]:hover:bg-muted',
    ),
  };
}

export function TagPillContent({
  name,
  color,
  selected = false,
  partial = false,
  locked = false,
  suggest = false,
  trailing,
  maxWidth = 'max-w-[132px]',
}: {
  name: string;
  color: string;
  selected?: boolean;
  partial?: boolean;
  locked?: boolean;
  suggest?: boolean;
  trailing?: React.ReactNode;
  maxWidth?: string;
}) {
  const lead = suggest ? (
    <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
  ) : partial ? (
    <Minus className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
  ) : selected ? (
    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
  ) : (
    <span
      aria-hidden
      className={cn('h-2 w-2 shrink-0 rounded-full', locked && 'opacity-40 grayscale')}
      style={{ backgroundColor: color }}
    />
  );
  return (
    <>
      {lead}
      <span className={cn('truncate', maxWidth)}>{name}</span>
      {locked && <Lock className="h-3 w-3 shrink-0" strokeWidth={2.75} />}
      {trailing}
    </>
  );
}
