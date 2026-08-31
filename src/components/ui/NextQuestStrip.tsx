'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronRight, Tags } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import {
  HintButton,
  ObjectiveLabel,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  claimRequestFor,
  objectiveCardTone,
  primeQuestsPageCache,
  refreshQuestHomeView,
  setQuestScrollTarget,
  sweepClaimLabels,
  useCompletionReveal,
  type Claimable,
  type Trackable,
} from '@/lib/questClaims';
import {
  priorityReasonLabel,
  rankByQuestPriority,
  scoreQuestPriority,
  WEEK_WINDOW_HOURS,
  resetCountdownLabel,
} from '@/lib/quests/priority';
import { QuestPriorityDebug } from '@/components/ui/QuestPriorityDebug';
import { useNotification } from '@/components/providers/NotificationProvider';
import { usePactView } from '@/components/pact/PactCard';
import { PactStripRow } from '@/components/pact/PactStripRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useUIStore } from '@/lib/uiStore';

/**
 * The bar's fill runs 500ms, so the hold has to clear that plus a beat to
 * read the finished state — handing the slot over any earlier cuts the
 * animation off part-way, which is the whole thing this exists to prevent.
 */
const PACT_ADVANCE_HOLD_MS = 950;

/** A Leap session is a real sitting, not a tick — priced like a focus block. */
const LEAP_SESSION_EFFORT_DAYS = 0.25;

/**
 * What survives skipping today once the full week is already out of reach:
 * the bonus is gone, near-miss protection can still carry the streak.
 */
const NEAR_MISS_SALVAGE = 0.5;

function hoursUntilLocalEndOfDay(now: Date): number {
  const endOfDay = new Date(now);
  endOfDay.setHours(24, 0, 0, 0);
  return Math.max(0, (endOfDay.getTime() - now.getTime()) / 3_600_000);
}

function hoursUntilStartTime(startTime: string, now: Date): number {
  const [hour, minute] = (startTime || '').split(':').map(Number);
  if (!Number.isFinite(hour)) return 0;
  const at = new Date(now);
  at.setHours(hour, Number.isFinite(minute) ? minute : 0, 0, 0);
  return (at.getTime() - now.getTime()) / 3_600_000;
}

export function NextQuestStrip({
  claimables,
  trackables,
  catalog,
  isPremium,
}: {
  claimables?: Claimable[];
  trackables?: Trackable[];
  catalog?: Record<string, QuestRewardCatalogItem>;
  isPremium?: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const { showNotification } = useNotification();
  const { data: pactView, isLoading: pactLoading } = usePactView();
  const [claiming, setClaiming] = useState(false);

  const claimable =
    claimables?.find((c) => c.placement === 'onboarding') ?? claimables?.[0];
  const claimableCount = claimables?.length ?? 0;

  const { ranked, laterTiers } = useMemo(() => {
    // A tier the same act already advances is not a separate thing to do.
    // Keep the nearest of each such group so "next up" names the objective
    // that closes first, not the biggest one sharing its action.
    const nearestByAction = new Map<string, Trackable>();
    for (const t of trackables ?? []) {
      if (!t.actionKey) continue;
      const key = `${t.questId ?? t.id}:${t.actionKey}`;
      const held = nearestByAction.get(key);
      if (!held || t.target - t.progress < held.target - held.progress) {
        nearestByAction.set(key, t);
      }
    }
    const undominated = (trackables ?? []).filter((t) => {
      if (!t.actionKey) return true;
      const key = `${t.questId ?? t.id}:${t.actionKey}`;
      return nearestByAction.get(key)?.id === t.id;
    });

    const rankedAll = undominated.length
      ? rankByQuestPriority(
          undominated.map((t) => ({
            ...t,
            streakAtRisk: t.effortAtRiskDays,
          })),
        )
      : [];
    const seenQuests = new Set<string>();
    const ranked: typeof rankedAll = [];
    const laterTiers: typeof rankedAll = [];
    for (const entry of rankedAll) {
      const key = entry.item.questId ?? entry.item.id;
      if (seenQuests.has(key)) {
        laterTiers.push(entry);
        continue;
      }
      seenQuests.add(key);
      ranked.push(entry);
    }
    return { ranked, laterTiers };
  }, [trackables]);
  const rankedNextUp = ranked[0] ?? null;
  const nextUp = rankedNextUp?.item ?? null;
  const nextUpReasonLabel = rankedNextUp
    ? priorityReasonLabel(rankedNextUp.result)
    : null;
  const nextUpHoursLeft = rankedNextUp?.result.hoursUntilReset ?? null;
  const nextUpResetLabel = nextUpReasonLabel
    ? null
    : resetCountdownLabel(nextUpHoursLeft);

  // Hold the just-finished trackable on screen so its progress bar visibly
  // fills before the card swaps to the "Reward ready" state.
  const heldTrackableRef = useRef<Trackable | null>(null);
  useEffect(() => {
    if (nextUp && !claimable) heldTrackableRef.current = nextUp;
  });
  useCompletionReveal(nextUp?.id ?? 'strip:none', false);
  const claimableRevealed = useCompletionReveal(
    claimable?.id ?? 'strip:none',
    !!claimable,
  );
  const goldenClaim =
    claimable?.kind === 'sweep' &&
    (claimable.sweepMega || claimable.sweepTier === 'golden');
  const held = heldTrackableRef.current;
  const fillingTrackable =
    claimable && !claimableRevealed && held && held.id === claimable.id
      ? { ...held, progress: Math.max(1, held.target) }
      : null;
  const displayNextUp = fillingTrackable ?? nextUp;
  const showClaimable = !!claimable && !fillingTrackable;

  // One slot, one winner. Rewards outrank work, so a finished pact week comes
  // first and a quest claimable second; below that the pact holds the slot for
  // as long as it is running, because it is the only thing on this page the
  // user personally promised — quests are ambient by comparison.
  const livePact =
    pactView?.enabled && !pactView.needsAreas && pactView.active
      ? pactView
      : null;

  // A finished session both advances the bar and disqualifies the pact from
  // the slot in the same render, so the fill it earned never got to play —
  // the row was replaced by the next quest mid-frame. Holding the slot for
  // one bar animation makes the cause visible before the effect: you see the
  // thing you just did land, and only then does the slot change hands.
  const pactProgress = livePact?.active?.progress ?? null;
  const prevPactProgress = useRef<number | null>(null);
  const [holdUntil, setHoldUntil] = useState(0);
  useEffect(() => {
    const prev = prevPactProgress.current;
    prevPactProgress.current = pactProgress;
    if (prev === null || pactProgress === null || pactProgress <= prev) return;
    setHoldUntil(Date.now() + PACT_ADVANCE_HOLD_MS);
  }, [pactProgress]);
  useEffect(() => {
    if (!holdUntil) return;
    const remaining = holdUntil - Date.now();
    if (remaining <= 0) {
      setHoldUntil(0);
      return;
    }
    const timer = window.setTimeout(() => setHoldUntil(0), remaining);
    return () => window.clearTimeout(timer);
  }, [holdUntil]);
  const holdingPactAdvance = holdUntil > 0;

  const pactReady = !!livePact?.active?.claimable && !livePact.active.claimed;
  const onboardingPending = nextUp?.placement === 'onboarding';
  // The slot goes to whatever the user can act on now. A pact with no session
  // today, or today's session already done, is not actionable — holding the
  // slot then hides the daily quests that are. A week that can no longer be
  // kept, even on near-miss protection, is not worth the slot either.
  const pactActionable =
    !!livePact?.active?.openToday &&
    (livePact.active.canStillFinish ||
      livePact.active.canFinishWithMoves ||
      livePact.active.canHoldStreak);

  // Both kinds are scored on the same axes so the slot is won, not assigned.
  // A Leap earns it when skipping today actually costs something: no slack
  // left in the week, a streak on the line, or the last session outstanding.
  const leapRanked = useMemo(() => {
    const active = pactActionable ? livePact?.active : null;
    if (!active) return null;
    const now = new Date();
    // Chances, not calendar days: a Wednesday is not a spare session unless
    // the pact is actually scheduled on it.
    const chancesLeft = active.sessions.filter((s) => s.state === 'open').length;
    const effectiveTarget = active.canStillFinish
      ? active.target
      : active.nearMissTarget;
    const sessionsNeeded = Math.max(0, effectiveTarget - active.progress);
    const weekSlack = Math.max(
      0,
      chancesLeft - Math.max(0, active.target - active.progress),
    );
    const streakSlack = Math.max(
      0,
      chancesLeft - Math.max(0, active.nearMissTarget - active.progress),
    );
    const salvageIfSkipped =
      weekSlack > 0
        ? weekSlack / (weekSlack + 1)
        : streakSlack > 0
          ? NEAR_MISS_SALVAGE
          : 0;
    return scoreQuestPriority({
      kind: 'leap',
      placement: 'daily',
      progress: active.progress,
      target: Math.max(1, effectiveTarget),
      hoursLeftInWindow: Math.max(0, active.daysLeft) * 24,
      windowHours: WEEK_WINDOW_HOURS,
      salvageIfSkipped,
      streakSalvageIfSkipped: streakSlack > 0 ? 1 : 0,
      hoursLeftToday: hoursUntilLocalEndOfDay(now),
      dueInHours: hoursUntilStartTime(active.startTime, now),
      effortToActNow: LEAP_SESSION_EFFORT_DAYS,
      effortToComplete: LEAP_SESSION_EFFORT_DAYS * Math.max(1, sessionsNeeded),
      streakAtRisk: livePact?.streak.weeks ?? 0,
      rewardValue: active.rewardFlies,
      // Nothing banks mid-week any more: the Leap pays once, at settlement.
      rewardBankedNow: 0,
    });
  }, [pactActionable, livePact]);

  const leapOutranksQuests =
    !!leapRanked &&
    (!rankedNextUp || leapRanked.score >= rankedNextUp.result.score);

  const pactWins =
    !!livePact &&
    (pactReady ||
      holdingPactAdvance ||
      (pactActionable &&
        !claimable &&
        !onboardingPending &&
        leapOutranksQuests));

  const resolvedCatalog = catalog ?? {};
  const targetQuestId =
    claimable && claimable.kind === 'objective'
      ? claimable.questId ?? null
      : !claimable && nextUp
        ? nextUp.questId ?? null
        : null;

  const goToQuests = () => {
    if (targetQuestId) setQuestScrollTarget(targetQuestId);
    router.push('/quests');
  };

  const handleClaim = async (target: Claimable) => {
    if (claiming) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const request = claimRequestFor(target, timezone);
    if (!request) {
      goToQuests();
      return;
    }
    setClaiming(true);
    try {
      const res = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      enqueueQuestRewardReveal(payload.rewardSummary, {
        catalog: (catalog ?? {}) as RevealCatalog,
        isPremium: !!isPremium,
        showFlyGainPill: false,
      });
      const shields = payload.rewardSummary?.shieldsGranted ?? 0;
      if (shields > 0) {
        showNotification(
          <span className="text-[13px] font-black text-foreground">
            {shields > 1
              ? `You rolled ${shields} Lily Pads!`
              : 'You rolled a Lily Pad!'}
          </span>,
        );
      }
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } catch {
      // Stale claimable (expired daily, claimed elsewhere) — re-sync so the
      // strip stops offering it.
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } finally {
      setClaiming(false);
    }
  };

  // Transform and opacity only: both are composited, so the swap never asks
  // the main thread for layout or paint while it plays.
  const slotMotion = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, y: 10, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8, scale: 0.985 },
        transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const },
      };

  // The Leap and the quests arrive from two different requests. Committing the
  // slot to whichever lands first is what made a refresh show a daily quest and
  // then visibly swap to the Leap a second later, so the slot waits until both
  // contenders are known before it picks one.
  const awaitingPact = pactLoading && !pactView;

  const slotKey = awaitingPact
    ? 'loading'
    : pactWins
      ? 'pact'
      : showClaimable && claimable
        ? `claim:${claimable.id}`
        : displayNextUp
          ? `next:${displayNextUp.id}`
          : 'empty';

  const strip = awaitingPact ? (
    <div className="mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-xl px-1 py-1 md:mx-4 md:mb-0 md:w-[calc(100%-2rem)] md:gap-3 md:px-4 md:py-1.5">
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-24 rounded-md" />
        <Skeleton className="h-4 w-2/3 rounded-md" />
      </div>
    </div>
  ) : pactWins && livePact ? (
    <PactStripRow view={livePact} />
  ) : !claimable && !nextUp ? null : (
    <div
      role="button"
      tabIndex={0}
      onClick={goToQuests}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goToQuests();
        }
      }}
      className={`group relative mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer items-center text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 md:mx-4 md:w-[calc(100%-2rem)] ${
        showClaimable
          ? `mb-2 gap-3 rounded-2xl border p-3 shadow-sm md:mb-3 md:p-3.5 ${
              goldenClaim
                ? 'border-amber-400/70 bg-amber-100/80 hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-500/15 dark:hover:bg-amber-500/20'
                : `${objectiveCardTone(true)} hover:bg-lime-100 dark:hover:bg-lime-500/20`
            }`
          : 'mb-1.5 gap-2.5 rounded-xl px-1 py-1 hover:bg-muted/30 md:mb-0 md:gap-3 md:rounded-xl md:border-0 md:bg-transparent md:px-4 md:py-1.5 md:shadow-none md:hover:bg-muted/30'
      }`}
    >
      {showClaimable && claimable ? (
        <>
          <div className="shrink-0 animate-[reward-pop_0.4s_ease-out_both] motion-reduce:animate-none">
            <div className="animate-quest-pulse">
              <QuestRewardTileBadge
                reward={claimable.reward}
                rewards={claimable.rewards}
                catalog={resolvedCatalog}
                isPremium={!!isPremium}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden leading-tight animate-[reward-pop_0.4s_ease-out_0.07s_both] motion-reduce:animate-none">
            <span
              className={`text-[12px] font-black ${
 goldenClaim
 ? 'text-amber-700 dark:text-amber-400'
 : 'text-lime-700 dark:text-lime-400'
 }`}
            >
              {claimable.kind === 'sweep'
                ? sweepClaimLabels(claimable).eyebrow
                : claimableCount > 1
                  ? `${claimableCount} rewards ready`
                  : 'Reward ready'}
            </span>
            <span className="mt-0.5 block min-w-0 truncate text-[13px] font-black text-foreground">
              {claimable.kind === 'season' ? (
                <span className="block truncate">
                  {claimable.seasonName
                    ? `${claimable.seasonName} · Tier ${claimable.tier}`
                    : `Season tier ${claimable.tier}`}
                </span>
              ) : claimable.kind === 'sweep' ? (
                <span className="block truncate">
                  {sweepClaimLabels(claimable).title}
                </span>
              ) : (
                <ObjectiveLabel label={claimable.objectiveLabel} />
              )}
            </span>
          </div>
          <span
            className="inline-flex shrink-0 animate-[reward-pop_0.45s_ease-out_0.14s_both] motion-reduce:animate-none"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={claiming ? 'inline-flex' : 'claim-wobble inline-flex'}>
              <button
                type="button"
                disabled={claiming}
                onClick={() => void handleClaim(claimable)}
                className="inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-xl bg-amber-500 px-3 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow,opacity] hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 min-[380px]:min-w-[7rem] min-[380px]:px-4"
              >
                {claiming
                  ? claimable.kind === 'sweep'
                    ? 'Opening…'
                    : 'Claiming…'
                  : claimable.kind === 'sweep'
                    ? sweepClaimLabels(claimable).action
                    : 'Claim'}
              </button>
            </span>
          </span>
        </>
      ) : displayNextUp ? (
        <>
          <QuestRewardTileBadge
            reward={displayNextUp.reward}
            rewards={displayNextUp.rewards}
            catalog={resolvedCatalog}
            isPremium={!!isPremium}
            small
          />
          {displayNextUp.needsFocusTags ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] font-black text-foreground">
                Pick a tag to start this quest
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 text-[12px] font-black text-primary">
                <Tags aria-hidden="true" className="h-3 w-3" strokeWidth={2.75} />
                Pick a tag
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
              <span className="hidden items-center gap-1.5 text-[11px] font-bold text-muted-foreground md:flex">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                />
                Next Quest
              </span>
              <span className="flex min-w-0 items-center text-[12px] font-black leading-tight text-foreground md:text-[14px] md:font-bold">
                <span className="min-w-0 flex-1 md:truncate">
                  <ObjectiveLabel
                    label={displayNextUp.remainingLabel}
                    tags={displayNextUp.tags}
                    maxTags={1}
                  />
                </span>
                {!fillingTrackable && (nextUpReasonLabel || nextUpResetLabel) ? (
                  <span className="ml-1.5 hidden shrink-0 whitespace-nowrap text-[10px] font-bold text-muted-foreground min-[400px]:inline">
                    {nextUpReasonLabel ?? nextUpResetLabel}
                  </span>
                ) : null}
              </span>
              <ObjectiveProgressBar
                heightClassName="h-4 md:h-3.5"
                progress={displayNextUp.progress}
                target={displayNextUp.target}
              />
            </div>
          )}
          {displayNextUp.hint && !displayNextUp.needsFocusTags ? (
            <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
              <HintButton
                text={displayNextUp.hint}
                tags={displayNextUp.tags}
                onShowMe={
                  displayNextUp.guideId
                    ? () =>
                        startHintGuide(displayNextUp.guideId!, {
                          ...displayNextUp.guideContext,
                          tags: displayNextUp.tags,
                        })
                    : undefined
                }
              />
            </span>
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          )}
        </>
      ) : null}
    </div>
  );

  return (
    <>
    {/* mode="wait" so the outgoing row finishes leaving before the next one
        arrives — two rows cross-fading in the same slot read as a glitch,
        one handing over to the other reads as a consequence. */}
    <AnimatePresence mode="wait" initial={false}>
      {strip && (
        <motion.div
          key={slotKey}
          {...slotMotion}
          style={{ willChange: 'transform, opacity' }}
        >
          {strip}
        </motion.div>
      )}
    </AnimatePresence>
    <div className="mx-1.5 mb-2 w-[calc(100%-0.75rem)] empty:hidden md:mx-4 md:w-[calc(100%-2rem)]">
      <QuestPriorityDebug
        title="home next-up"
        entries={ranked.map(({ item, result }) => ({
          label: `[${item.placement}] ${item.remainingLabel}`,
          input: item,
          result,
        }))}
        excluded={laterTiers.map(({ item }) => ({
          label: `[${item.placement}] ${item.remainingLabel}`,
          reason: 'later tier of a quest already listed',
        }))}
        notes={[
          'onboarding: active tier first, before the normal priority pool',
          'order: needs-tag last → score (2 decimals) → lower tier → least work left → fewest remaining → sooner reset',
          'near = 1/(1 + days of work left): streak units cost their day count minus the live run, tasks ~0.1d, focus min ~0.01d',
          'pool: best objective per quest (onboarding + daily + areas)',
          'urgency = perishability x max(clock, fits-today); score x readiness',
          'perishability: daily = 1 (gone at reset); leap = what a skipped day burns',
          'reward = flies the NEXT action banks (leap: session now + bonus/sessions left)',
        ]}
      />
    </div>
    </>
  );
}
