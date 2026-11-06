'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminPage({
  title,
  subtitle,
  icon,
  actions,
  tabs,
  wide = false,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pb-32 pt-5 md:px-8 md:pb-20 md:pt-8',
        wide ? 'max-w-[1400px]' : 'max-w-5xl',
      )}
    >
      <header className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
        {icon ? <IconTile size="lg">{icon}</IconTile> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground md:text-[30px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-[14px] font-medium leading-snug text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        {tabs ? <div className="w-full">{tabs}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function IconTile({
  children,
  size = 'md',
  tone = 'pond',
  className,
}: {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl',
        size === 'lg' && 'h-12 w-12 [&_svg]:h-6 [&_svg]:w-6',
        size === 'md' && 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5',
        size === 'sm' && 'h-8 w-8 rounded-xl [&_svg]:h-4 [&_svg]:w-4',
        TONES[tone].tile,
        className,
      )}
    >
      {children}
    </span>
  );
}

export type Tone = 'pond' | 'sun' | 'berry' | 'sky' | 'grape' | 'stone' | 'danger';

export const TONES: Record<Tone, { tile: string; chip: string; ring: string }> = {
  pond: {
    tile: 'bg-primary/15 text-primary shadow-[0_3px_0_0_hsl(var(--primary)/0.22)]',
    chip: 'border-primary/30 bg-primary/10 text-primary',
    ring: 'ring-primary/40',
  },
  sun: {
    tile: 'bg-amber-400/15 text-amber-600 shadow-[0_3px_0_0_rgba(217,119,6,0.22)] dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-500/40',
  },
  berry: {
    tile: 'bg-rose-500/15 text-rose-600 shadow-[0_3px_0_0_rgba(225,29,72,0.2)] dark:text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500/40',
  },
  sky: {
    tile: 'bg-sky-500/15 text-sky-600 shadow-[0_3px_0_0_rgba(2,132,199,0.2)] dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    ring: 'ring-sky-500/40',
  },
  grape: {
    tile: 'bg-violet-500/15 text-violet-600 shadow-[0_3px_0_0_rgba(124,58,237,0.2)] dark:text-violet-400',
    chip: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
    ring: 'ring-violet-500/40',
  },
  stone: {
    tile: 'bg-muted text-muted-foreground shadow-[0_3px_0_0_hsl(var(--border))]',
    chip: 'border-border bg-muted/60 text-muted-foreground',
    ring: 'ring-border',
  },
  danger: {
    tile: 'bg-red-500/15 text-red-600 shadow-[0_3px_0_0_rgba(220,38,38,0.2)] dark:text-red-400',
    chip: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    ring: 'ring-red-500/40',
  },
};

export function AdminCard({
  title,
  subtitle,
  icon,
  tone = 'pond',
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[24px] border border-border/70 bg-card shadow-[0_3px_0_0_hsl(var(--border))]',
        className,
      )}
    >
      {title || actions ? (
        <div className="flex flex-wrap items-start gap-3 px-5 pt-5">
          {icon ? <IconTile tone={tone}>{icon}</IconTile> : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="text-[17px] font-black leading-tight tracking-tight text-foreground">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cn('p-5', bodyClassName)}>{children}</div> : null}
    </section>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground/80', className)}>
      {children}
    </p>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.15)]' : 'bg-muted shadow-[inset_0_2px_0_0_rgba(0,0,0,0.06)]',
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_0_0_rgba(0,0,0,0.15)] transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-black text-foreground">{title}</p>
        {description ? <p className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground">{description}</p> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={typeof title === 'string' ? title : undefined} />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('grid content-start gap-1.5', className)}>
      <span className="text-[12px] font-black text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] font-medium leading-snug text-muted-foreground/90">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15';

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  step = 1,
  suffix,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex w-full items-center', className)}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const raw = Number(event.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(Math.min(max, Math.max(min, raw)));
        }}
        className={cn(inputClass, 'tabular-nums', suffix ? 'pr-14' : '')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 text-[12px] font-bold text-muted-foreground">{suffix}</span>
      ) : null}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-muted/70 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-xl font-black transition',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active
                ? 'bg-card text-foreground shadow-[0_2px_0_0_hsl(var(--border))]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  tone = 'pond',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-black transition',
        active ? TONES[tone].chip : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function PondButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-black transition active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-10 px-4 text-[13px]',
        variant === 'primary' &&
          'bg-primary text-primary-foreground shadow-[0_3px_0_0_#2c511a] hover:brightness-105 active:shadow-[0_1px_0_0_#2c511a]',
        variant === 'secondary' &&
          'border border-border bg-card text-foreground shadow-[0_3px_0_0_hsl(var(--border))] hover:bg-muted/50 active:shadow-[0_1px_0_0_hsl(var(--border))]',
        variant === 'danger' &&
          'bg-red-500 text-white shadow-[0_3px_0_0_#991b1b] hover:brightness-105 active:shadow-[0_1px_0_0_#991b1b]',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Notice({
  type,
  children,
  className,
}: {
  type: 'success' | 'error' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] font-bold',
        type === 'success' && 'border-primary/25 bg-primary/10 text-primary',
        type === 'error' && 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400',
        type === 'info' && 'border-border bg-muted/50 text-muted-foreground',
        className,
      )}
    >
      {type === 'success' ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0" /> : null}
      {type === 'error' ? <XCircle className="mt-px h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  label = 'Unsaved changes',
  saveLabel = 'Save changes',
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  label?: React.ReactNode;
  saveLabel?: string;
}) {
  return (
    <AnimatePresence>
      {dirty ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 26, stiffness: 340 }}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6 lg:pl-[var(--admin-sidebar-w,0px)]"
        >
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-[20px] border border-border bg-card/95 px-4 py-2.5 shadow-[0_4px_0_0_hsl(var(--border)),0_18px_40px_-12px_rgba(0,0,0,0.25)] backdrop-blur">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-black text-foreground">{label}</p>
            {onDiscard ? (
              <PondButton variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                Discard
              </PondButton>
            ) : null}
            <PondButton size="sm" onClick={onSave} loading={saving}>
              {saving ? 'Saving…' : saveLabel}
            </PondButton>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border-2 border-dashed border-border/70 px-5 py-10 text-center text-[13px] font-bold text-muted-foreground">
      {children}
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-[24px] border border-border/60 bg-card" />
      ))}
    </div>
  );
}

export function useJsonDirty<T>(current: T, saved: T) {
  return React.useMemo(() => JSON.stringify(current) !== JSON.stringify(saved), [current, saved]);
}

export function PageTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; badge?: React.ReactNode }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex gap-1 rounded-2xl border border-border/70 bg-card p-1 shadow-[0_3px_0_0_hsl(var(--border))]">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-black transition',
                active
                  ? 'bg-primary text-primary-foreground shadow-[0_2px_0_0_#2c511a]'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {option.label}
              {option.badge !== undefined && option.badge !== null ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    active ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {option.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'stone',
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[20px] border border-border/70 bg-card px-4 py-3 shadow-[0_3px_0_0_hsl(var(--border))]', className)}>
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-[24px] font-black leading-tight tabular-nums', tone === 'stone' ? 'text-foreground' : TONES[tone].tile.split(' ').find((cls) => cls.startsWith('text-')))}>
        {value}
      </p>
      {hint ? <p className="text-[12px] font-medium leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ResetLink({ onClick, children = 'Defaults' }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-black text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export function FieldGrid({ children, cols = 3, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ConfigShell({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  if (loading) return <LoadingBlock rows={3} />;
  return (
    <>
      {error ? <Notice type="error" className="mb-4">{error}</Notice> : null}
      {children}
    </>
  );
}
