'use client';

import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { SheetEnteredContext } from '@/lib/sheetEntered';
import { Icon } from '@/components/ui/Icon';
import type { FrogEmote } from '@/lib/frogEmotes';
import type { FrogStampIndices } from '@/lib/frogStampEngine';
import { INCLUDED, NOT_INCLUDED, type PlusPerk } from '@/lib/plusPaywall';
import { cn } from '@/lib/utils';

export function PlusGoldButton({
  onClick,
  children,
  disabled,
  loading,
  className,
}: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(
        'plus-upgrade-button relative isolate flex min-h-[54px] w-full touch-manipulation items-center justify-center overflow-hidden rounded-2xl bg-[var(--plus-cta)] px-4 py-3 text-[17px] font-black text-[var(--plus-cta-ink)] [--plus-button-base:var(--plus-cta-edge)] hover:bg-[var(--plus-cta-hover)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none',
        loading && 'disabled:opacity-100',
        className,
      )}
    >
      {!disabled ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-[40%] -z-10 w-[35%] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_4.2s_ease-in-out_1.2s_infinite]"
        />
      ) : null}
      {children}
    </button>
  );
}

function PerkValue({ value, plus = false }: { value: string; plus?: boolean }) {
  if (value === INCLUDED) {
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-[var(--plus-cta)] text-[var(--plus-cta-ink)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === NOT_INCLUDED) {
    return (
      <span className="text-muted-foreground/50">
        <span aria-hidden>—</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  const wordy = value.length > 3;
  if (!plus) return <>{value}</>;
  return (
    <span className={cn('font-black text-primary', wordy ? 'text-[14px]' : 'text-[19px] leading-none')}>
      {value}
    </span>
  );
}

export function PerkLedger({
  perks,
  onSeeAll,
  freeLabel = 'Free',
  plusLabel = 'Plus',
  className,
}: {
  perks: PlusPerk[];
  onSeeAll?: () => void;
  freeLabel?: string;
  plusLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-[24px] bg-card px-4 pb-1.5 pt-2 shadow-[0_4px_0_0_rgba(26,8,56,0.35)]',
        className,
      )}
    >
      <span aria-hidden className="plus-lane absolute bottom-2 right-3 top-2 -z-10 w-[84px] rounded-[18px]" />
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">What changes with Plus</caption>
        <colgroup>
          <col />
          <col className="w-[52px]" />
          <col className="w-[76px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="h-8 p-0 font-normal">
              {onSeeAll ? (
                <button
                  type="button"
                  onClick={onSeeAll}
                  className="-ml-1.5 inline-flex min-h-8 items-center gap-0.5 rounded-lg px-1.5 text-[13px] font-black text-primary transition-colors hover:bg-white/10 active:bg-white/15"
                >
                  All perks
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </button>
              ) : (
                <span className="sr-only">Perk</span>
              )}
            </th>
            <th scope="col" className="p-0 text-center text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
              {freeLabel}
            </th>
            <th scope="col" className="p-0 text-center text-[11px] font-black uppercase tracking-[0.08em] text-primary">
              <span className="inline-flex items-center gap-1">
                <Icon name="frogPlus" className="h-5 w-5" />
                {plusLabel}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {perks.map((perk, index) => (
            <tr
              key={perk.label}
              className="plus-benefit-rise border-t border-white/10"
              style={{ animationDelay: `${100 + index * 55}ms` }}
            >
              <th scope="row" className="py-[9px] pr-2 text-[14.5px] font-bold leading-tight short:py-[7px]">
                {perk.label}
              </th>
              <td className="p-0 text-center text-[14px] font-bold tabular-nums text-muted-foreground">
                <PerkValue value={perk.free} />
              </td>
              <td className="p-0 text-center tabular-nums">
                <span className="plus-benefit-pop inline-block" style={{ animationDelay: `${220 + index * 70}ms` }}>
                  <PerkValue value={perk.plus} plus />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STAGE_STARS = [
  { left: '9%', top: '20%', size: 16, delay: '0s' },
  { left: '21%', top: '54%', size: 10, delay: '0.9s' },
  { left: '84%', top: '16%', size: 14, delay: '0.4s' },
  { left: '76%', top: '50%', size: 9, delay: '1.3s' },
  { left: '64%', top: '10%', size: 8, delay: '1.7s' },
];

export function PlusStage({
  look,
  greet = 'tada',
  size = 'lg',
  fly = true,
  className,
  children,
}: {
  look: FrogStampIndices;
  greet?: FrogEmote | null;
  size?: 'lg' | 'sm';
  fly?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const entered = React.useContext(SheetEnteredContext);
  const [landed, setLanded] = React.useState(false);
  const big = size === 'lg';
  const width = big ? 170 : 128;
  const height = big ? 180 : 136;
  return (
    <div
      className={cn(
        'relative z-10 flex shrink-0 items-end justify-center',
        big ? 'h-[204px] short:h-[172px]' : 'h-[148px]',
        className,
      )}
    >
      <div aria-hidden className="plus-stage absolute inset-0 -z-10 overflow-hidden">
        <span className="plus-stage-rays absolute left-1/2 top-[70%] h-[640px] w-[640px]" />
        {STAGE_STARS.map((star) => (
          <svg
            key={star.left}
            viewBox="0 0 24 24"
            width={star.size}
            height={star.size}
            className="plus-stage-star absolute"
            style={{ left: star.left, top: star.top, animationDelay: star.delay }}
          >
            <path fill="#f5c84c" d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
          </svg>
        ))}
        <span
          className={cn(
            'plus-stage-podium absolute left-1/2 -translate-x-1/2 rounded-[50%]',
            big ? '-bottom-[34px] h-[78px] w-[250px]' : '-bottom-[28px] h-[62px] w-[196px]',
          )}
        />
      </div>
      <div className="relative -mb-0.5" style={{ width, height }}>
        {entered ? (
          <Frog
            width={width}
            height={height}
            indices={look}
            greet={greet}
            arrive="hop"
            onArrived={() => setLanded(true)}
          />
        ) : null}
        {fly && landed ? (
          <PremiumFrogAura
            show
            alwaysPlay
            flySize={big ? 42 : 34}
            className="[--premium-fly-top:34%] [--premium-fly-x-max:44px] [--premium-fly-x-min:-52px] [--premium-fly-y-max:8px] [--premium-fly-y-min:-6px]"
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PlusEarnedStrip({
  earned,
  label,
  className,
}: {
  earned: { flies: number; rareItems: number };
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'plus-benefit-rise flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[13.5px] font-bold text-muted-foreground',
        className,
      )}
    >
      <span>{label}</span>
      {earned.flies > 0 ? (
        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 font-black text-foreground">
          <FlyAmount amount={`+${earned.flies.toLocaleString('en-US')}`} size={16} />
        </span>
      ) : null}
      {earned.rareItems > 0 ? (
        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 font-black text-foreground">
          {earned.rareItems} rare+ {earned.rareItems === 1 ? 'outfit' : 'outfits'}
        </span>
      ) : null}
    </div>
  );
}
