'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { HOME_CARD_SURFACE } from '@/components/ui/taskSurfaces';
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
import { OnboardingFrogHeader, useTypewriter } from './OnboardingFrogHeader';
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

const PLAN_ROW_CLASS = `flex items-center gap-3 pl-4 pr-2 ${HOME_CARD_SURFACE}`;

const planRowSizeClass = (count: number) =>
  count >= 5 ? 'min-h-[58px] py-1.5' : count === 4 ? 'min-h-[62px] py-2' : 'min-h-[68px] py-2.5';

const PLAN_TOP_CLASS =
  'pt-[calc(270px+env(safe-area-inset-top))] short:pt-[calc(232px+env(safe-area-inset-top))] md:pt-[264px]';

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

  const [committed, setCommitted] = useState(false);
  const seenRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

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

  const vars = { n: items.length, name: humanName, frog: frogName };
  const headline = fill(data?.copy?.headline, "{name}'s starter plan", vars);
  const subheadline = fill(data?.copy?.subheadline, 'Try these easy goals with {frog}!', vars);
  const acceptLabel = fill(data?.copy?.acceptLabel, "Let's do it!", vars);
  const loading = items.length === 0;

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

  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[62dvh] bg-[radial-gradient(120%_62%_at_50%_0%,rgba(108,187,95,0.28),rgba(108,187,95,0.08)_48%,transparent_78%)] dark:bg-[radial-gradient(120%_62%_at_50%_0%,rgba(108,187,95,0.16),rgba(108,187,95,0.05)_48%,transparent_78%)]"
      />
      <OnboardingFrogHeader title="" speechBubbleMessage={frogLine} speechTypedChars={typed} />

      <div className={cn('relative z-20 flex w-full flex-col md:mx-auto md:max-w-md', PLAN_TOP_CLASS)}>
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          aria-labelledby="starter-plan-title"
          className="pond-panel relative rounded-[28px] border-2 border-[color:var(--pond-line)] bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom))] px-3 pb-3 pt-6 shadow-[0_4px_0_0_var(--pond-line)]"
        >
          <span
            aria-hidden
            className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent dark:via-white/20"
          />
          <h1
            id="starter-plan-title"
            className="text-balance px-3 text-center text-[22px] font-black leading-tight tracking-tight text-[color:var(--pond-ink)]"
          >
            {headline}
          </h1>
          <p className="mx-auto mt-1 max-w-[19rem] text-balance text-center text-[15px] font-semibold leading-snug text-[color:var(--pond-ink-muted)]">
            {subheadline}
          </p>

          <ul aria-labelledby="starter-plan-title" className="mt-3.5 flex flex-col gap-2">
            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <li key={i} className={cn(PLAN_ROW_CLASS, planRowSizeClass(4))}>
                    <span className="block h-3.5 flex-1 animate-pulse rounded-full bg-muted" />
                    <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                  </li>
                ))
              : items.map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0.2 }
                        : { delay: 0.25 + 0.09 * index, type: 'spring', stiffness: 420, damping: 26 }
                    }
                    className={cn(PLAN_ROW_CLASS, planRowSizeClass(items.length))}
                  >
                    <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-foreground">
                      {item.text}
                    </span>
                    <motion.span
                      aria-hidden
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.42 + 0.09 * index, type: 'spring', stiffness: 520, damping: 18 }}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/[0.16] ring-1 ring-inset ring-primary/25"
                    >
                      <Fly size={40} y={-3} interactive={false} />
                    </motion.span>
                  </motion.li>
                ))}
          </ul>
        </motion.section>
      </div>

      <div className="flex-1" />

      <OnboardingFooter>
        <OnboardingButton
          onClick={() => commit(items.map((item) => item.id))}
          disabled={loading || (committed && !saving)}
          loading={saving}
        >
          {acceptLabel}
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
