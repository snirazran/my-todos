'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Moon, Sun } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import {
  applyStarterDayStart,
  clampStarterDayStartMinutes,
  earliestStarterTime,
  normalizeStarterDayStart,
  pickStarterTagColor,
  starterMinutesToTime,
  sortStarterPlanItems,
  starterTimeLabel,
  starterTimeToMinutes,
  STARTER_DAY_START_MAX_MINUTES,
  STARTER_DAY_START_MIN_MINUTES,
  STARTER_DAY_START_STEP_MINUTES,
  type StarterDayStart,
  type StarterPlanItem,
} from '@/lib/quests/starterPlan';
import { TimeTag } from '@/components/ui/TimeTag';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { hapticGrab, hapticTick } from '@/lib/haptics';

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
  const [dayStart, setDayStart] = useState<StarterDayStart | undefined>(() =>
    normalizeStarterDayStart(selections.starterPlanDayStart?.[0]),
  );
  const items = useMemo(
    () => sortStarterPlanItems(applyStarterDayStart(baseItems, dayStart)),
    [baseItems, dayStart],
  );
  const baseEarliest = useMemo(() => earliestStarterTime(baseItems), [baseItems]);
  const tagColors = useMemo(() => {
    const taken = new Set<string>();
    const map = new Map<string, string>();
    for (const item of baseItems) {
      if (map.has(item.categoryId)) continue;
      const color = pickStarterTagColor(item.categoryId, taken, item.categoryAccent);
      taken.add(color.toLowerCase());
      map.set(item.categoryId, color);
    }
    return map;
  }, [baseItems]);
  const sliderMinutes = useMemo(
    () =>
      clampStarterDayStartMinutes(
        starterTimeToMinutes(dayStart ?? baseEarliest) ??
          STARTER_DAY_START_MIN_MINUTES,
      ),
    [dayStart, baseEarliest],
  );
  const sliderPercent =
    ((sliderMinutes - STARTER_DAY_START_MIN_MINUTES) /
      (STARTER_DAY_START_MAX_MINUTES - STARTER_DAY_START_MIN_MINUTES)) *
    100;
  const [checked, setChecked] = useState<string[] | null>(null);
  const skippedRef = useRef(false);
  const seenRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

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
    onSelect('starterPlanDayStart', dayStart ?? '');
    onSelect('starterPlan', '__clear__');
    ids.forEach((id) => onSelect('starterPlan', id, true));
    onNext();
  };

  const setDayStartMinutes = useCallback((minutes: number) => {
    const next = starterMinutesToTime(clampStarterDayStartMinutes(minutes));
    setDayStart((prev) => {
      if (prev === next) return prev;
      hapticTick();
      return next;
    });
  }, []);

  const setDayStartFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setDayStartMinutes(
        STARTER_DAY_START_MIN_MINUTES +
          ratio * (STARTER_DAY_START_MAX_MINUTES - STARTER_DAY_START_MIN_MINUTES),
      );
    },
    [setDayStartMinutes],
  );

  const handleSliderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    hapticGrab();
    setDayStartFromPointer(event.clientX);
  };

  const handleSliderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    setDayStartFromPointer(event.clientX);
  };

  const endSliderDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    trackAnalyticsEvent('starter_plan_day_start', {
      dayStart: starterMinutesToTime(sliderMinutes),
    });
  };

  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (saving) return;
    const jump = event.shiftKey ? 60 : STARTER_DAY_START_STEP_MINUTES;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setDayStartMinutes(sliderMinutes - jump);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setDayStartMinutes(sliderMinutes + jump);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setDayStartMinutes(STARTER_DAY_START_MIN_MINUTES);
    } else if (event.key === 'End') {
      event.preventDefault();
      setDayStartMinutes(STARTER_DAY_START_MAX_MINUTES);
    }
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
        <div className="flex w-full flex-col gap-2 pb-2 md:mx-auto md:max-w-md">
          {!isLoading && checked !== null && baseEarliest && (
            <div className="rounded-xl border border-border/60 bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.10)] dark:bg-muted">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-black tracking-wide text-muted-foreground">
                  My day starts at
                </span>
                <motion.span
                  key={sliderMinutes}
                  initial={{ opacity: 0.4, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-lg font-black tabular-nums tracking-tight text-primary"
                >
                  {starterTimeLabel(starterMinutesToTime(sliderMinutes))}
                </motion.span>
              </div>

              <div
                role="slider"
                tabIndex={saving ? -1 : 0}
                aria-label="My day starts at"
                aria-valuemin={STARTER_DAY_START_MIN_MINUTES}
                aria-valuemax={STARTER_DAY_START_MAX_MINUTES}
                aria-valuenow={sliderMinutes}
                aria-valuetext={starterTimeLabel(starterMinutesToTime(sliderMinutes))}
                aria-disabled={saving || undefined}
                onPointerDown={handleSliderPointerDown}
                onPointerMove={handleSliderPointerMove}
                onPointerUp={endSliderDrag}
                onPointerCancel={endSliderDrag}
                onKeyDown={handleSliderKeyDown}
                className={cn(
                  'mt-1.5 touch-none select-none py-2.5 outline-none',
                  saving ? 'cursor-not-allowed opacity-70' : 'cursor-grab',
                  dragging && 'cursor-grabbing',
                )}
              >
                <div ref={trackRef} className="relative h-2.5 rounded-full bg-muted">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${sliderPercent}%` }}
                  />
                  <span
                    aria-hidden
                    className="absolute top-1/2 -ml-3.5 -mt-3.5 block h-7 w-7"
                    style={{ left: `${sliderPercent}%` }}
                  >
                    <motion.span
                      animate={{ scale: dragging ? 1.15 : 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={cn(
                        'grid h-full w-full place-items-center rounded-full border-[3px] border-primary bg-background shadow-md transition-shadow',
                        dragging && 'shadow-lg ring-4 ring-primary/20',
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </motion.span>
                  </span>
                </div>
              </div>

              <div className="mt-0.5 flex items-center justify-between text-[11px] font-bold tracking-wide text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Moon className="h-3 w-3" />
                  {starterTimeLabel(starterMinutesToTime(STARTER_DAY_START_MIN_MINUTES))}
                </span>
                <span className="flex items-center gap-1">
                  {starterTimeLabel(starterMinutesToTime(STARTER_DAY_START_MAX_MINUTES))}
                  <Sun className="h-3 w-3" />
                </span>
              </div>
            </div>
          )}

          {!isLoading && checked !== null && items.length > 0 && (
            <div className="flex items-baseline justify-between px-1 pt-1">
              <span className="text-[13px] font-black tracking-wide text-muted-foreground">
                Your day
              </span>
              <span className="text-[12px] font-bold tabular-nums tracking-wide text-muted-foreground/70">
                {selectedIds.length} added
              </span>
            </div>
          )}

          {isLoading || checked === null
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-xl bg-muted/50"
                />
              ))
            : items.map((item, index) => {
                const isChecked = selectedIds.includes(item.id);
                const tagColor = tagColors.get(item.categoryId);
                const tagLabel = item.categoryShortLabel?.trim() || item.categoryName;
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
                      delay: 0.05 * index,
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200',
                      isChecked
                        ? 'border-primary/40 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.10)] dark:bg-muted'
                        : 'border-transparent bg-muted/40 opacity-60',
                      saving && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap items-center gap-1">
                        {item.timeLabel && item.startTime ? (
                          <motion.span
                            key={item.startTime}
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex"
                          >
                            <TimeTag startTime={item.timeLabel} className="text-[11px]" />
                          </motion.span>
                        ) : null}
                        {tagColor ? (
                          <span
                            className="tag-chip inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold tracking-normal shadow-sm"
                            style={
                              {
                                backgroundColor: `${tagColor}20`,
                                borderColor: `${tagColor}40`,
                                '--tag-color': tagColor,
                              } as React.CSSProperties
                            }
                          >
                            {tagLabel}
                          </span>
                        ) : null}
                        {item.cadence !== 'daily' ? (
                          <span className="inline-flex items-center rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                            {item.cadenceLabel}
                          </span>
                        ) : null}
                      </span>

                      <span className="block text-[15px] font-semibold leading-snug text-foreground md:text-[17px]">
                        {item.text}
                      </span>
                      {item.anchor ? (
                        <span className="mt-0.5 block truncate text-[13px] font-medium leading-snug text-muted-foreground">
                          {item.anchor}
                        </span>
                      ) : null}
                    </span>

                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                        isChecked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30 bg-transparent text-transparent',
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
