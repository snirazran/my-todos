'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Flame,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlyWorth } from '@/components/ui/QuestCards';
import { ObjectiveProgressBar } from '@/lib/questClaims';
import type { PactView } from '@/lib/pact/types';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { PactShieldSheet } from './PactShieldSheet';
import { PactPickSheet } from './PactPickSheet';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function pactViewKey(timezone?: string) {
  const tz =
    timezone ??
    (typeof window === 'undefined'
      ? 'UTC'
      : Intl.DateTimeFormat().resolvedOptions().timeZone);
  return `/api/pact?timezone=${encodeURIComponent(tz)}`;
}

export function usePactView() {
  return useSWR<PactView>(pactViewKey(), fetcher, {
    revalidateOnFocus: false,
  });
}

/**
 * Home shares vertical space with the frog scene and the task list, so its
 * banner is roughly half the height of the one on the quests page, where the
 * card is the main event. Ratios are inline rather than Tailwind arbitrary
 * classes so they cannot be dropped by a stale JIT pass.
 */
const BANNER_RATIO = {
  home: { empty: '16 / 4.5', active: '16 / 4' },
  panel: { empty: '16 / 7', active: '16 / 6' },
} as const;

export function PactCard({
  variant = 'home',
}: {
  variant?: 'home' | 'panel';
} = {}) {
  const ratio = BANNER_RATIO[variant];
  const { data, mutate } = usePactView();
  const [pickOpen, setPickOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [claimingRetro, setClaimingRetro] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [changing, setChanging] = useState(false);

  if (!data || !data.enabled || data.needsAreas) return null;

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (res.ok) mutate(payload.view, { revalidate: false });
    } finally {
      setClaiming(false);
    }
  };

  const claimRetro = async () => {
    if (claimingRetro) return;
    setClaimingRetro(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/retro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (res.ok) mutate(payload.view, { revalidate: false });
    } finally {
      setClaimingRetro(false);
    }
  };

  // Swapping is destructive — the week's tasks are released and the pact is
  // deleted — so it always states its price first. A swap token absorbs it;
  // without one the streak goes back to zero.
  const changeCommitment = async () => {
    if (changing) return;
    setChanging(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, action: 'drop' }),
      });
      const payload = await res.json();
      if (res.ok) {
        mutate(payload.view, { revalidate: false });
        setConfirmChange(false);
        setPickOpen(true);
      }
    } finally {
      setChanging(false);
    }
  };

  const active = data.active;
  // Home shows a running pact through the quest strip instead — a full card
  // there sat between the frog and the task list and read as an interruption.
  // The quests page keeps the whole card, where it is the main event.
  //
  // Hidden, not unmounted: the pick sheet lives inside this component, so
  // returning null the instant a pact exists tore the sheet off the screen
  // mid-commit and took its success step with it.
  const hideCard = variant === 'home' && !!active;
  const teaser = data.areas.find((entry) => entry.recommended) ?? data.areas[0];
  return (
    <>
      <div
        className={cn(
          'mx-1.5 mb-2 w-[calc(100%-0.75rem)] md:mx-4 md:w-[calc(100%-2rem)]',
          hideCard && 'hidden',
        )}
      >
        {/* The retroactive pile. Free users see what is waiting; the moment
            they subscribe the same row becomes a claim. */}
        {data.forgoneFlies > 0 && (
          <button
            type="button"
            onClick={() =>
              data.isPremium ? void claimRetro() : setPlusOpen(true)
            }
            className="mb-2 flex w-full items-center gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-400/10 px-3 py-2.5 text-left transition active:scale-[0.99]"
          >
            <Sparkles
              className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
              strokeWidth={2.75}
            />
            <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug text-foreground">
              {data.isPremium ? (
                <>
                  <span className="font-black text-amber-500 dark:text-amber-400">
                    {data.forgoneFlies} flies
                  </span>{' '}
                  waiting from before Plus
                </>
              ) : (
                <>
                  <span className="font-black text-amber-500 dark:text-amber-400">
                    {data.forgoneFlies} flies
                  </span>{' '}
                  waiting — Plus doubles every pact
                </>
              )}
            </span>
            <span className="inline-flex h-8 shrink-0 items-center rounded-xl bg-amber-500 px-3 text-[12px] font-black text-white">
              {data.isPremium ? (claimingRetro ? '…' : 'Collect') : 'See Plus'}
            </span>
          </button>
        )}
        {!active ? (
          <button
            type="button"
            data-hint="pact-pick-area"
            onClick={() => setPickOpen(true)}
            className="w-full overflow-hidden rounded-[24px] border border-border/50 bg-card text-left shadow-sm transition active:scale-[0.99] [@media(hover:hover)]:hover:shadow-md"
          >
            {/* Full-width art on a short band. The crop is biased upward so
                the frog's head survives a ratio this wide. */}
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: ratio.empty }}
            >
              {teaser?.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={teaser.coverImageUrl}
                  alt={teaser.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-[center_40%]"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background: `linear-gradient(135deg, ${teaser?.backgroundFrom ?? '#134e4a'}, ${teaser?.backgroundTo ?? '#0f172a'})`,
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/25" />
              {/* On its own the label vanished into the bright top of the
                  art — it needs its own ground, not more opacity. */}
              <span className="absolute left-3 top-2.5 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                This week
              </span>
              <span
                className="absolute bottom-2 left-3.5 text-[19px] uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                style={{
                  fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                  WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                  paintOrder: 'stroke fill',
                }}
              >
                Pick your area
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="min-w-0 truncate text-[12px] font-bold text-muted-foreground">
                {teaser
                  ? `${teaser.name} has been quiet`
                  : 'Takes about a minute'}
              </span>
              <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309]">
                <Play className="h-3.5 w-3.5 fill-current" />
                Start
              </span>
            </div>
          </button>
        ) : (
          <div
            className={cn(
              'overflow-hidden rounded-[24px] border shadow-sm',
              active.claimable
                ? 'border-lime-500/50 bg-lime-500/10'
                : 'border-border/50 bg-card',
            )}
          >
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: ratio.active }}
            >
              {active.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.coverImageUrl}
                  alt={active.categoryName}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background: `linear-gradient(135deg, ${active.backgroundFrom ?? '#0f172a'}, ${active.backgroundTo ?? '#1e293b'})`,
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent" />
              <span
                className="absolute bottom-2 left-3.5 text-[19px] uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                style={{
                  fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                  WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                  paintOrder: 'stroke fill',
                }}
              >
                {active.categoryName}
              </span>
              {data.streak.weeks > 0 && (
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[11px] font-black text-amber-300 backdrop-blur-sm">
                  <Flame className="h-3.5 w-3.5" strokeWidth={2.75} />
                  {data.streak.weeks}
                </span>
              )}
            </div>

            <div className="px-3.5 py-3">
              <p className="text-[15px] font-black leading-snug text-foreground">
                {active.commitmentText}
              </p>

              {/* The same bar every quest objective uses — a pact is one more
                  thing being counted toward, and a second bar style made it
                  look like a different kind of progress. */}
              <div className="mt-2.5">
                <ObjectiveProgressBar
                  heightClassName="h-4 md:h-3.5"
                  progress={active.progress}
                  target={active.target}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                  {active.claimable ? (
                    <>
                      <FlyWorth amount={active.rewardFlies} />
                      <span>ready</span>
                    </>
                  ) : (
                    <span className="truncate">
                      {active.nextTaskLabel
                        ? `Next: ${active.nextTaskLabel}`
                        : active.scheduleLabel}
                    </span>
                  )}
                </span>
                {active.claimable && !active.claimed ? (
                  <button
                    type="button"
                    onClick={claim}
                    disabled={claiming}
                    className="inline-flex h-8 min-w-[5.5rem] items-center justify-center rounded-xl bg-amber-500 px-3 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                  >
                    {claiming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Claim'
                    )}
                  </button>
                ) : (
                  <span
                    className={cn(
                      'text-[11px] font-bold',
                      data.streak.atRisk
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {data.streak.atRisk
                      ? 'Streak at risk!'
                      : `${active.daysLeft} day${active.daysLeft === 1 ? '' : 's'} left`}
                  </span>
                )}
              </div>

              {!active.claimed && (
                <div className="mt-2 flex items-center justify-end">
                  {confirmChange ? (
                    <span className="flex w-full items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
                      <span className="min-w-0 text-[11px] font-bold text-muted-foreground">
                        {data.swapTokens > 0
                          ? `Uses 1 of your ${data.swapTokens} swaps — streak safe`
                          : 'This resets your streak to zero'}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmChange(false)}
                          className="h-7 rounded-lg px-2 text-[11px] font-black text-muted-foreground"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={changeCommitment}
                          disabled={changing}
                          className="inline-flex h-7 min-w-[4.5rem] items-center justify-center rounded-lg bg-destructive px-2.5 text-[11px] font-black text-white disabled:opacity-60"
                        >
                          {changing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Change'
                          )}
                        </button>
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmChange(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-black text-muted-foreground transition hover:text-foreground"
                    >
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />
                      Change commitment
                    </button>
                  )}
                </div>
              )}

              {/* Surfaced on the active card only, and loudest when the week
                  is slipping — a safety net advertised before there is
                  anything to lose is just noise. */}
              <button
                type="button"
                onClick={() => setShieldOpen(true)}
                className={cn(
                  'mt-2 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition active:scale-[0.99]',
                  data.streak.atRisk
                    ? 'bg-sky-500/12 ring-1 ring-sky-500/35'
                    : 'bg-muted/40',
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                  <ShieldCheck
                    className={cn(
                      'h-4 w-4',
                      data.streak.shields > 0
                        ? 'text-sky-500'
                        : 'text-muted-foreground',
                    )}
                    strokeWidth={2.5}
                  />
                  {data.streak.shields > 0
                    ? `${data.streak.shields} shield${data.streak.shields === 1 ? '' : 's'} ready`
                    : 'No shield if you miss'}
                </span>
                <span className="text-[12px] font-black text-primary">
                  {data.streak.shields >= data.streak.shieldCap
                    ? 'How it works'
                    : 'Get one'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <PactPickSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        view={data}
        onCommitted={(next) => mutate(next, { revalidate: false })}
        onUpgrade={() => setPlusOpen(true)}
      />

      <PactShieldSheet
        open={shieldOpen}
        onClose={() => setShieldOpen(false)}
        view={data}
        onChanged={(next) => mutate(next, { revalidate: false })}
      />

      <PlusUpgradeModal
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        placement="pact_write_own"
      />
    </>
  );
}
