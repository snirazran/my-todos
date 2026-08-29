'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** The one input shape every control in the popup editor uses. */
export const inputClass =
  'h-10 w-full rounded-xl bg-muted px-3 text-sm font-semibold text-foreground outline-none ring-0 transition-shadow placeholder:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary';

export function Hint({
  text,
  children,
  className,
  side = 'top',
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={className}>{children}</div>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs font-semibold leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function HelpDot({ text }: { text: string }) {
  return (
    <Hint text={text}>
      <HelpCircle
        aria-hidden
        className="h-3.5 w-3.5 cursor-help text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      />
    </Hint>
  );
}

export function Field({
  label,
  help,
  hint,
  children,
  className,
}: {
  label: string;
  /** A `?` beside the label, explained on hover. */
  help?: string;
  /** A line of guidance always visible under the control. */
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('block min-w-0', className)}>
      <label
        htmlFor={id}
        className="mb-1 flex items-center gap-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {help ? <HelpDot text={help} /> : null}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
      {hint ? (
        <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  invalid,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  return (
    <input
      {...rest}
      id={id}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(inputClass, invalid && 'ring-2 ring-red-500')}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={cn(inputClass, 'cursor-pointer appearance-none pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
        backgroundSize: '0.85rem',
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  id,
  suffix,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  id?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }
        className={cn(inputClass, suffix && 'pr-9')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  help?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
        {help ? <HelpDot text={help} /> : null}
        <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[hsl(var(--primary))]"
      />
    </label>
  );
}

/**
 * Sizes are fixed pixels rather than rem-based utilities: the knob has to land
 * inside the track exactly, and a track built out of scalable units drifts as
 * soon as anything in the cascade changes the root size.
 */
const SWITCH = { width: 40, height: 24, knob: 18, pad: 3 };

export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <span className="inline-flex select-none items-center gap-2 text-[12px] font-black text-muted-foreground">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{ width: SWITCH.width, height: SWITCH.height, padding: 0 }}
        className={cn(
          'relative box-border inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 outline-none transition-colors duration-200',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked
            ? 'bg-[#4f9149]'
            : 'bg-muted-foreground/25 ring-1 ring-inset ring-muted-foreground/20',
        )}
      >
        <span
          aria-hidden
          style={{
            width: SWITCH.knob,
            height: SWITCH.knob,
            transform: `translateX(${
              checked ? SWITCH.width - SWITCH.knob - SWITCH.pad : SWITCH.pad
            }px)`,
          }}
          className="pointer-events-none block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-out"
        />
      </button>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="cursor-pointer text-left font-black text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
      </button>
      {help ? <HelpDot text={help} /> : null}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: readonly { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-xl bg-muted p-0.5" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-[10px] font-black transition-colors',
            size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-xs',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({
  label,
  value,
  onChange,
  allowClear,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  const cleared = allowClear && !value;
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="relative">
        <input
          type="color"
          aria-label={label}
          value={safe}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent',
            cleared && 'opacity-40',
          )}
        />
      </span>
      {allowClear ? (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'rounded-md px-1.5 py-1 text-[10px] font-black transition-colors',
            cleared ? 'bg-foreground text-background' : 'bg-background text-muted-foreground',
          )}
        >
          none
        </button>
      ) : null}
    </span>
  );
}

/** A titled block that can be folded away. Open state is the caller's, so a
 *  panel can be opened from elsewhere — a review note jumping to its section. */
export function Panel({
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl bg-muted/30', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open ? '' : '-rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black">{title}</span>
          {subtitle ? (
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
        {badge}
      </button>
      {open ? <div className="space-y-3 px-3 pb-3">{children}</div> : null}
    </section>
  );
}

/** Panel state without every caller declaring its own booleans. */
export function usePanels(initial: string[]) {
  const [open, setOpen] = useState<string[]>(initial);
  return {
    isOpen: (key: string) => open.includes(key),
    toggle: (key: string) =>
      setOpen((current) =>
        current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
      ),
    openPanel: (key: string) =>
      setOpen((current) => (current.includes(key) ? current : [...current, key])),
  };
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <span className="text-muted-foreground/60">{icon}</span>
      <p className="text-sm font-black">{title}</p>
      <p className="max-w-xs text-xs font-medium leading-snug text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
