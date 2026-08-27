'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import {
  applyStarterDayStart,
  earliestStarterTime,
  normalizeStarterDayStart,
  shiftStarterTime,
  starterTimeLabel,
  STARTER_DAY_START_DEFAULT,
  STARTER_DAY_START_OPTIONS,
  type StarterDayStart,
  type StarterPlanItem,
} from '@/lib/quests/starterPlan';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type PlanResponse = {
  isActive?: boolean;
  copy?: {
    headline?: string;
    subheadline?: string;
    acceptLabel?: string;
    declineLabel?: string;
    footnote?: string;
  };
  items?: StarterPlanItem[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fill(
  template: string | undefined,
  fallback: string,
  vars: { n: number; name: string; frog: string },
) {
  return (template ?? fallback)
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{name\}/g, vars.name)
    .replace(/\{frog\}/g, vars.frog)
    .replace(/\s*,\s*$/, '')
    .trim();
}

export default function StarterPlanStep({
  selections,
  onSelect,
  onNext,
  saving,
  direction,
}: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0]?.trim() || '';
  const focusAreas = useMemo(() => selections.focusAreas ?? [], [selections.focusAreas]);
  const areasKey = focusAreas.join(',');

  const { data, isLoading } = useSWR<PlanResponse>(
    areasKey
      ? `/api/onboarding/starter-plan?areas=${encodeURIComponent(areasKey)}`
      : null,
    fetcher,
  );

  const baseItems = useMemo(() => data?.items ?? [], [data]);
  const [dayStart, setDayStart] = useState<StarterDayStart>(() =>
    normalizeStarterDayStart(selections.starterPlanDayStart?.[0]),
  );
  const items = useMemo(
    () => applyStarterDayStart(baseItems, dayStart),
    [baseItems, dayStart],
  );
  const dayStartChoices = useMemo(() => {
    const earliest = earliestStarterTime(baseItems);
    return STARTER_DAY_START_OPTIONS.map((option) => ({
      ...option,
      example: starterTimeLabel(shiftStarterTime(earliest, option.id)),
    }));
  }, [baseItems]);
  const [checked, setChecked] = useState<string[] | null>(null);
  const skippedRef = useRef(false);
  const seenRef = useRef(false);

  useEffect(() => {
    if (checked !== null || items.length === 0) return;
    const returning = selections.starterPlanChoice?.[0];
    setChecked(
      returning
        ? items
            .filter((item) => (selections.starterPlan ?? []).includes(item.id))
            .map((item) => item.id)
        : items.map((item) => item.id),
    );
  }, [items, checked, selections.starterPlan, selections.starterPlanChoice]);

  useEffect(() => {
    if (seenRef.current || items.length === 0) return;
    seenRef.current = true;
    trackAnalyticsEvent('starter_plan_shown', {
      offered: items.length,
      areas: focusAreas.length,
    });
  }, [items, focusAreas]);

  useEffect(() => {
    if (isLoading || skippedRef.current) return;
    if (!areasKey || (data && items.length === 0)) {
      skippedRef.current = true;
      onNext();
    }
  }, [isLoading, data, items, areasKey, onNext]);

  const selectedIds = checked ?? [];
  const vars = { n: selectedIds.length, name: humanName, frog: frogName };
  const headline = fill(data?.copy?.headline, 'Your starting plan', vars);
  const subheadline = fill(
    data?.copy?.subheadline,
    'Small on purpose — the kind you actually keep.',
    vars,
  );
  const acceptLabel = fill(data?.copy?.acceptLabel, 'Start with this plan', vars);
  const declineLabel = fill(data?.copy?.declineLabel, "I'll add my own", vars);
  const footnote = fill(
    data?.copy?.footnote,
    'Change the days, the time, or remove any of them later.',
    vars,
  );

  const toggle = (id: string) => {
    setChecked((prev) => {
      const current = prev ?? [];
      return current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
    });
  };

  const commit = (ids: string[]) => {
    onSelect('starterPlanChoice', ids.length > 0 ? 'accept' : 'skip');
    onSelect('starterPlanDayStart', dayStart);
    onSelect('starterPlan', '__clear__');
    ids.forEach((id) => onSelect('starterPlan', id, true));
    onNext();
  };

  const pickDayStart = (next: StarterDayStart) => {
    setDayStart(next);
    trackAnalyticsEvent('starter_plan_day_start', { dayStart: next });
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <OnboardingFrogHeader title={headline} subtitle={subheadline} />

      <motion.div
        key="starter-plan"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex flex-col items-center', ONBOARDING_BODY_CLASS)}
      >
        <div className="flex w-full flex-col gap-2.5 pb-2 md:mx-auto md:max-w-md">
          {!isLoading && checked !== null && dayStartChoices.some((c) => c.example) && (
            <div className="mb-1 flex flex-col gap-1.5">
              <span className="px-1 text-[13px] font-black tracking-wide text-muted-foreground">
                My day starts
              </span>
              <div
                role="radiogroup"
                aria-label="My day starts"
                className="flex gap-1.5 rounded-2xl bg-muted/50 p-1.5"
              >
                {dayStartChoices.map((choice) => {
                  const active = choice.id === dayStart;
                  return (
                    <motion.button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pickDayStart(choice.id)}
                      disabled={saving}
                      whileTap={{ scale: 0.96 }}
                      className={cn(
                        'flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors duration-200',
                        active
                          ? 'bg-background shadow-sm ring-2 ring-primary/60'
                          : 'text-muted-foreground hover:bg-background/60',
                        saving && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <span
                        className={cn(
                          'text-sm font-black tracking-tight',
                          active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {choice.label}
                      </span>
                      <span
                        className={cn(
                          'text-[12px] font-bold tabular-nums',
                          active ? 'text-primary' : 'text-muted-foreground/70',
                        )}
                      >
                        {choice.example}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading || checked === null
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-3xl border-2 border-border/40 bg-muted/40"
                />
              ))
            : items.map((item, index) => {
                const isChecked = selectedIds.includes(item.id);
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    aria-pressed={isChecked}
                    onClick={() => toggle(item.id)}
                    disabled={saving}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.06 * index,
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'flex items-center gap-3 rounded-3xl border-2 bg-background px-4 py-3 text-left shadow-sm transition-colors duration-200',
                      isChecked
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:border-primary/30',
                      saving && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-base font-black leading-tight tracking-tight',
                          isChecked ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {item.text}
                      </span>
                      {item.anchor ? (
                        <span className="mt-0.5 block text-sm font-medium leading-snug text-muted-foreground line-clamp-2">
                          {item.anchor}
                        </span>
                      ) : null}
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[13px] font-black tracking-wide',
                            isChecked
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {item.cadenceLabel}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-wide text-muted-foreground/70">
                          {item.categoryName}
                        </span>
                        {item.timeLabel ? (
                          <motion.span
                            key={item.timeLabel}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="shrink-0 text-[13px] font-black tabular-nums tracking-wide text-muted-foreground"
                          >
                            {item.timeLabel}
                          </motion.span>
                        ) : null}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                        isChecked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-transparent',
                      )}
                      aria-hidden
                    >
                      <Check className="h-4 w-4 stroke-[3.5]" />
                    </span>
                  </motion.button>
                );
              })}

          <p className="px-2 pt-1 text-center text-xs font-medium leading-snug text-muted-foreground">
            {footnote}
          </p>
        </div>
      </motion.div>

      <div className="flex-1" />

      <div className="sticky bottom-0 z-30 mt-2 flex flex-col items-center gap-2 bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-t from-background to-transparent"
        />
        <motion.button
          type="button"
          onClick={() => commit(selectedIds)}
          disabled={saving || checked === null}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'h-14 w-full rounded-2xl text-base font-bold tracking-wide shadow-lg transition-all duration-200 md:w-80',
            selectedIds.length > 0
              ? 'bg-primary text-primary-foreground shadow-primary/25 hover:brightness-110'
              : 'bg-muted text-muted-foreground shadow-none',
            (saving || checked === null) && 'cursor-not-allowed opacity-70',
          )}
        >
          {selectedIds.length > 0 ? acceptLabel : 'Continue'}
        </motion.button>

        <button
          type="button"
          onClick={() => commit([])}
          disabled={saving}
          className={cn(
            'h-11 text-sm font-black text-muted-foreground transition-colors hover:text-foreground',
            saving && 'cursor-not-allowed opacity-70',
          )}
        >
          {declineLabel}
        </button>
      </div>
    </div>
  );
}
