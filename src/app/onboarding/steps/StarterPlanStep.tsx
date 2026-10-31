'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import useSWR, { preload } from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import {
  barrierQuestionId,
  parseStarterProfile,
  starterCapacityCap,
  STARTER_PROFILE_KEYS,
  type StarterPlanItem,
  type StarterProfile,
} from '@/lib/quests/starterPlan';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { hapticSelect } from '@/lib/haptics';
import { OnboardingFrogHeader, ONBOARDING_SPLIT_STEP_CLASS, useTypewriter } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

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

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Starter plan ${r.status}`);
    return r.json();
  });

export function starterPlanParams(selections: Record<string, string[]>) {
  const areas = selections.focusAreas ?? [];
  const barriers = areas.flatMap((id) =>
    (selections[barrierQuestionId(id)] ?? [])
      .filter((answer) => answer !== 'other')
      .map((answer) => `${id}:${answer}`),
  );
  const profile = parseStarterProfile((key) => selections[key]?.[0]);
  return { areas, barriers, profile };
}

export function starterPlanUrl(selections: Record<string, string[]>) {
  const { areas, barriers, profile } = starterPlanParams(selections);
  const params = new URLSearchParams({ areas: areas.join(',') });
  if (barriers.length > 0) params.set('barriers', barriers.join(','));
  STARTER_PROFILE_KEYS.forEach((key) => {
    const value = profile[key];
    if (value) params.set(key, value);
  });
  return `/api/onboarding/starter-plan?${params.toString()}`;
}

export function preloadStarterPlan(url: string) {
  preload(url, fetcher).catch(() => {});
}

function fill(
  template: string | undefined,
  fallback: string,
  vars: { n: number; name: string; frog: string },
) {
  return (template ?? fallback)
    .replace(/\{habits\}/g, vars.n === 1 ? '1 habit' : `${vars.n} habits`)
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{name\}'s/g, vars.name ? `${vars.name}'s` : 'Your')
    .replace(/\{name\}/g, vars.name)
    .replace(/\{frog\}/g, vars.frog)
    .replace(/\s*,\s*$/, '')
    .trim();
}

function frogPlanLine(args: {
  name: string;
  profile: StarterProfile;
  usedBefore?: string;
  offered: number;
}) {
  const you = args.name ? `, ${args.name}` : '';
  if (starterCapacityCap(args.profile) !== undefined) {
    return `*Ribbit!* Just ${args.offered === 1 ? '1 goal' : `${args.offered} goals`} to start. We'll keep your list light!`;
  }
  if (args.profile.support === 'just-me') {
    return `*Ribbit!* You've got me now${you}. We'll do this together!`;
  }
  if (args.usedBefore === 'starting-fresh') {
    return `*Ribbit!* Fresh start${you}! Let's make this one stick.`;
  }
  return `*Ribbit!* You've got this${you}!`;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const planRowSize = (count: number) =>
  count >= 5
    ? { row: 'py-2', tile: 'h-10 w-10 text-xl' }
    : count === 4
      ? { row: 'py-2.5', tile: 'h-11 w-11 text-[22px]' }
      : { row: 'py-3', tile: 'h-12 w-12 text-2xl' };

const PLAN_TOP_CLASS =
  'pt-[calc(222px+env(safe-area-inset-top))] short:pt-[calc(200px+env(safe-area-inset-top))] md:pt-[264px] lg:pt-0';

export default function StarterPlanStep({
  selections,
  onSelect,
  onNext,
  saving,
}: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0]?.trim() || '';
  const { areas: focusAreas, profile } = useMemo(() => starterPlanParams(selections), [selections]);

  const { data, error } = useSWR<PlanResponse>(starterPlanUrl(selections), fetcher);
  const items = useMemo(() => data?.items ?? [], [data]);
  const ready = !!data || !!error;

  const [checked, setChecked] = useState<string[] | null>(null);
  const [committed, setCommitted] = useState(false);
  const seenRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    if (checked !== null || items.length === 0) return;
    setChecked(items.map((item) => item.id));
  }, [items, checked]);

  useEffect(() => {
    if (seenRef.current || items.length === 0) return;
    seenRef.current = true;
    trackAnalyticsEvent('starter_plan_shown', {
      offered: items.length,
      areas: focusAreas.length,
      barriers: items.filter((item) => !!item.reason).length,
      ...(profile.overwhelm ? { plan_load: profile.overwhelm } : {}),
    });
  }, [items, focusAreas, profile.overwhelm]);

  useEffect(() => {
    if (committed) onNextRef.current();
  }, [committed]);

  const commit = (ids: string[]) => {
    if (committed) return;
    onSelect('starterPlanChoice', ids.length > 0 ? 'accept' : 'skip');
    onSelect('starterPlan', '__clear__');
    ids.forEach((id) => onSelect('starterPlan', id, true));
    setCommitted(true);
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (ready && items.length === 0) commitRef.current([]);
  }, [ready, items]);

  const selectedIds = checked ?? [];
  const vars = { n: selectedIds.length, name: humanName, frog: frogName };
  const headline = fill(data?.copy?.headline, "{name}'s starter plan", vars);
  const subheadline = fill(data?.copy?.subheadline, 'Try these easy goals with {frog}!', vars);
  const acceptLabel = fill(data?.copy?.acceptLabel, "Let's do it!", vars);
  const loading = checked === null;
  const busy = saving || committed;
  const size = planRowSize(loading ? 4 : items.length);

  const frogLine = loading
    ? ''
    : frogPlanLine({
        name: humanName,
        profile,
        usedBefore: selections.usedBefore?.[0],
        offered: items.length,
      });
  const typed = useTypewriter(frogLine);
  const reduceMotion = useReducedMotion();

  const toggle = (id: string) => {
    hapticSelect();
    setChecked((prev) => {
      const current = prev ?? [];
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  };

  return (
    <div className={cn('relative flex flex-1 flex-col', ONBOARDING_SPLIT_STEP_CLASS)}>
      <OnboardingFrogHeader title="" speechBubbleMessage={frogLine} speechTypedChars={typed} />

      <div className={cn('relative z-20 flex w-full flex-col md:mx-auto md:max-w-md', PLAN_TOP_CLASS)}>
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          aria-labelledby="starter-plan-title"
          className="rounded-[28px] border border-border/60 bg-card px-3 pb-3 pt-5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)] dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.8)] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        >
          <h1
            id="starter-plan-title"
            className="text-balance px-3 text-center text-2xl font-black leading-tight tracking-tight text-foreground lg:text-[28px] lg:leading-[1.15]"
          >
            {headline}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-balance text-center text-[15px] font-medium leading-snug text-muted-foreground lg:mt-2">
            {subheadline}
          </p>

          <ul aria-labelledby="starter-plan-title" className="mt-4 flex flex-col gap-2 lg:mt-7 lg:gap-2.5">
            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-center gap-3.5 rounded-[20px] border-2 border-border/40 bg-card px-3.5',
                      size.row,
                    )}
                  >
                    <span className={cn('shrink-0 animate-pulse rounded-2xl bg-muted', size.tile)} />
                    <span className="block h-3.5 w-3/5 animate-pulse rounded-full bg-muted" />
                  </li>
                ))
              : items.map((item, index) => {
                  const isChecked = selectedIds.includes(item.id);
                  return (
                    <motion.li
                      key={item.id}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0.2 }
                          : { delay: 0.15 + 0.06 * index, duration: 0.35, ease: EASE }
                      }
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => toggle(item.id)}
                        disabled={busy}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-[20px] border-2 bg-card px-3.5 text-left transition-[border-color,box-shadow,transform] duration-200 [-webkit-tap-highlight-color:transparent] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
                          size.row,
                          isChecked
                            ? 'border-primary/40 shadow-[0_3px_0_0_hsl(var(--primary)/0.22)]'
                            : 'border-border/60 shadow-[0_3px_0_0_rgba(0,0,0,0.05)]',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'grid shrink-0 place-items-center rounded-2xl bg-muted/70 leading-none transition-[opacity,filter] duration-200',
                            size.tile,
                            !isChecked && 'opacity-50 grayscale',
                          )}
                        >
                          {item.emoji || '✨'}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 text-[15px] font-bold leading-snug text-foreground transition-opacity duration-200',
                            !isChecked && 'opacity-55',
                          )}
                        >
                          {item.text}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,color,transform] duration-200',
                            isChecked
                              ? 'scale-100 border-primary bg-primary text-primary-foreground'
                              : 'scale-95 border-muted-foreground/25 text-transparent',
                          )}
                        >
                          <Check className="h-4 w-4" strokeWidth={3.5} />
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
          </ul>
        </motion.section>
      </div>

      <div className="flex-1 lg:max-h-8" />

      <OnboardingFooter className="pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <OnboardingButton
          onClick={() => commit(selectedIds)}
          disabled={loading || selectedIds.length === 0 || (committed && !saving)}
          loading={saving}
        >
          {acceptLabel}
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
