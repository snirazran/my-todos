'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import useSWR, { preload } from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import type { StarterPlanItem } from '@/lib/quests/starterPlan';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { hapticSelect } from '@/lib/haptics';
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

const planUrl = (areasKey: string) =>
  `/api/onboarding/starter-plan?areas=${encodeURIComponent(areasKey)}`;

export function preloadStarterPlan(areasKey: string) {
  preload(planUrl(areasKey), fetcher).catch(() => {});
}

function fill(
  template: string | undefined,
  fallback: string,
  vars: { n: number; name: string; frog: string },
) {
  return (template ?? fallback)
    .replace(/\{habits\}/g, vars.n === 1 ? '1 habit' : `${vars.n} habits`)
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{name\}/g, vars.name)
    .replace(/\{frog\}/g, vars.frog)
    .replace(/\s*,\s*$/, '')
    .trim();
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function StarterPlanStep({
  selections,
  onSelect,
  onNext,
  saving,
}: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0]?.trim() || '';
  const focusAreas = useMemo(() => selections.focusAreas ?? [], [selections.focusAreas]);
  const areasKey = focusAreas.join(',');

  const { data, error } = useSWR<PlanResponse>(planUrl(areasKey), fetcher);
  const items = useMemo(() => data?.items ?? [], [data]);
  const ready = !!data || !!error;

  const [checked, setChecked] = useState<string[] | null>(null);
  const [committed, setCommitted] = useState(false);
  const seenRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

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
  const headline = fill(data?.copy?.headline, 'Start small', vars);
  const subheadline = fill(data?.copy?.subheadline, "Tiny daily habits you'll actually keep.", vars);
  const acceptLabel = fill(data?.copy?.acceptLabel, 'Add {habits}', vars);
  const declineLabel = fill(data?.copy?.declineLabel, 'Skip for now', vars);
  const footnote = fill(data?.copy?.footnote, 'Change or remove any of them later.', vars);
  const loading = checked === null;
  const busy = saving || committed;

  const toggle = (id: string) => {
    hapticSelect();
    setChecked((prev) => {
      const current = prev ?? [];
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="flex w-full flex-col pt-[calc(4.5rem+env(safe-area-inset-top))] md:mx-auto md:max-w-md md:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="text-center"
        >
          <h1 className="text-balance text-[28px] font-black leading-[1.15] tracking-tight text-foreground">
            {headline}
          </h1>
          <p className="mx-auto mt-2 max-w-[19rem] text-balance text-[15px] font-medium leading-snug text-muted-foreground">
            {subheadline}
          </p>
        </motion.div>

        <ul aria-label="Suggested habits" className="mt-7 flex flex-col gap-2.5">
          {loading
            ? [0, 1, 2, 3, 4].map((i) => (
                <li
                  key={i}
                  className="flex items-center gap-3.5 rounded-[20px] border-2 border-border/40 px-3.5 py-3"
                >
                  <span className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-muted" />
                  <span className="block h-3.5 w-3/5 animate-pulse rounded-full bg-muted" />
                </li>
              ))
            : items.map((item, index) => {
                const isChecked = selectedIds.includes(item.id);
                const cue = item.cadence === 'daily' ? null : item.cadenceLabel;
                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + 0.05 * index, duration: 0.35, ease: EASE }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() => toggle(item.id)}
                      disabled={busy}
                      className={cn(
                        'flex w-full items-center gap-3.5 rounded-[20px] border-2 bg-card px-3.5 py-3 text-left transition-[border-color,box-shadow,transform] duration-200 [-webkit-tap-highlight-color:transparent] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
                        isChecked
                          ? 'border-primary/40 shadow-[0_3px_0_0_hsl(var(--primary)/0.22)]'
                          : 'border-border/60 shadow-[0_3px_0_0_rgba(0,0,0,0.05)]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted/70 text-2xl leading-none transition-[opacity,filter] duration-200',
                          !isChecked && 'opacity-50 grayscale',
                        )}
                      >
                        {item.emoji || '✨'}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 transition-opacity duration-200',
                          !isChecked && 'opacity-55',
                        )}
                      >
                        <span className="block text-[15px] font-bold leading-snug text-foreground">
                          {item.text}
                        </span>
                        {cue ? (
                          <span className="mt-0.5 block text-[13px] font-medium leading-snug text-muted-foreground">
                            {cue}
                          </span>
                        ) : null}
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

        {!loading && (
          <p className="mt-4 text-center text-[13px] font-medium text-muted-foreground">
            {footnote}
          </p>
        )}
      </div>

      <div className="flex-1" />

      <OnboardingFooter>
        <OnboardingButton
          onClick={() => commit(selectedIds)}
          disabled={loading || selectedIds.length === 0 || (committed && !saving)}
          loading={saving}
        >
          {acceptLabel}
        </OnboardingButton>
        <OnboardingButton variant="ghost" onClick={() => commit([])} disabled={busy}>
          {declineLabel}
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
