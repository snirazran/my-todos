'use client';

import { revealSweepClaim } from '@/components/ui/RewardRoll';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Check, Tags } from 'lucide-react';
import { QuestTrack } from '@/components/ui/QuestTrack';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import type { RevealCatalog } from '@/components/ui/questRewardReveal';
import {
  HintButton,
  ObjectiveLabel,
  QuestRewardTileBadge,
  claimRequestFor,
  primeQuestsPageCache,
  ratingMomentFor,
  refreshQuestHomeView,
  setQuestScrollTarget,
  setQuestStripOnScreen,
  sweepClaimLabels,
  useCompletionReveal,
  type Claimable,
  type Trackable,
} from '@/lib/questClaims';
import { rankByQuestPriority } from '@/lib/quests/priority';
import { QuestPriorityDebug } from '@/components/ui/QuestPriorityDebug';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useLeapView } from '@/components/leap/useLeapView';
import { LeapStripRow } from '@/components/leap/LeapStripRow';
import { leapHasHabits, leapLeft } from '@/components/leap/leapCopy';
import { Skeleton } from '@/components/ui/Skeleton';
import { useUIStore } from '@/lib/uiStore';
import {
  statusDockRowClass,
  type StatusDockRowState,
} from '@/components/home/StatusDock';

const LEAP_ADVANCE_HOLD_MS = 950;

const INTRO_FILL_DELAY_MS = 700;
const INTRO_FILL_HOLD_MS = 1100;

const seenClaimIds = new Set<string>();
let claimBaselineTaken = false;

export function NextQuestStrip({
  claimables,
  trackables,
  catalog,
  isPremium,
  introFill = false,
  introHold = false,
  loading = false,
  bellyRatio,
}: {
  claimables?: Claimable[];
  trackables?: Trackable[];
  catalog?: Record<string, QuestRewardCatalogItem>;
  isPremium?: boolean;
  introFill?: boolean;
  introHold?: boolean;
  loading?: boolean;
  bellyRatio?: number;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const { showNotification } = useNotification();
  const { data: leapView, isLoading: leapLoading } = useLeapView();
  const [claiming, setClaiming] = useState(false);
  const [stripEl, setStripEl] = useState<HTMLDivElement | null>(null);

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

  const [introStage, setIntroStage] = useState<'idle' | 'empty' | 'full' | 'done'>(
    'idle',
  );
  const introClaimable =
    introFill && claimable?.kind === 'objective' ? claimable : null;
  useEffect(() => {
    if (introStage === 'idle' && introClaimable && !introHold) {
      setIntroStage(reduceMotion ? 'done' : 'empty');
    }
  }, [introStage, introClaimable, introHold, reduceMotion]);
  useEffect(() => {
    if (introStage !== 'empty' && introStage !== 'full') return;
    const timer = window.setTimeout(
      () => setIntroStage(introStage === 'empty' ? 'full' : 'done'),
      introStage === 'empty' ? INTRO_FILL_DELAY_MS : INTRO_FILL_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [introStage]);
  const introTrackable: Trackable | null =
    introClaimable &&
    (introStage === 'empty' || introStage === 'full' || (introHold && introStage === 'idle'))
      ? {
          id: introClaimable.id,
          questId: introClaimable.questId,
          placement: introClaimable.placement ?? 'onboarding',
          objectiveLabel: introClaimable.objectiveLabel ?? '',
          remainingLabel: introClaimable.objectiveLabel ?? '',
          tags: introClaimable.tags,
          progress: introStage === 'full' ? 1 : 0,
          target: 1,
          reward: introClaimable.reward,
          rewards: introClaimable.rewards,
        }
      : null;

  const displayNextUp = introTrackable ?? fillingTrackable ?? nextUp;
  const showClaimable = !!claimable && !fillingTrackable && !introTrackable;
  const readyClaim = showClaimable ? claimable ?? null : null;

  if (!claimBaselineTaken && claimables && !loading) {
    claimBaselineTaken = true;
    claimables.forEach((c) => seenClaimIds.add(c.id));
  }
  const [freshClaimId, setFreshClaimId] = useState<string | null>(null);
  useEffect(() => {
    if (!readyClaim || seenClaimIds.has(readyClaim.id)) return;
    seenClaimIds.add(readyClaim.id);
    setFreshClaimId(readyClaim.id);
  }, [readyClaim]);
  const claimEntrance =
    !!readyClaim &&
    !reduceMotion &&
    (freshClaimId === readyClaim.id || !seenClaimIds.has(readyClaim.id));

  const bellyLinked =
    !readyClaim &&
    displayNextUp?.metricKey === 'frog_fed_full' &&
    typeof bellyRatio === 'number';
  const trackProgress = bellyLinked
    ? Math.min(
        (displayNextUp?.progress ?? 0) + Math.max(0, Math.min(0.97, bellyRatio)),
        Math.max(1, displayNextUp?.target ?? 1) - 0.03,
      )
    : (displayNextUp?.progress ?? 1);

  const liveLeap =
    leapView?.enabled && leapHasHabits(leapView) ? leapView : null;

  const leapHops = liveLeap?.week.hops ?? null;
  const prevLeapHops = useRef<number | null>(null);
  const [holdUntil, setHoldUntil] = useState(0);
  useEffect(() => {
    const prev = prevLeapHops.current;
    prevLeapHops.current = leapHops;
    if (prev === null || leapHops === null || leapHops <= prev) return;
    setHoldUntil(Date.now() + LEAP_ADVANCE_HOLD_MS);
  }, [leapHops]);
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
  const holdingLeapAdvance = holdUntil > 0;

  const onboardingPending = nextUp?.placement === 'onboarding';
  const leapOpenToday = liveLeap?.week.openToday ?? 0;
  const leapReachableToday =
    !!liveLeap &&
    leapOpenToday > 0 &&
    liveLeap.week.leap.available &&
    !liveLeap.week.leap.reached &&
    (leapOpenToday >= Math.max(1, leapLeft(liveLeap)) ||
      (liveLeap.league > 0 &&
        liveLeap.week.hold.available &&
        !liveLeap.week.hold.reached &&
        leapOpenToday >=
          Math.max(1, liveLeap.week.hold.target - liveLeap.week.hops)));
  const leapWins =
    !!liveLeap &&
    (holdingLeapAdvance ||
      (!claimable && !onboardingPending && (leapReachableToday || !nextUp)));

  const resolvedCatalog = catalog ?? {};
  const targetQuestId =
    claimable && claimable.kind === 'objective'
      ? claimable.questId ?? null
      : !claimable && nextUp
        ? nextUp.questId ?? null
        : null;

  const goToQuests = () => {
    if (introFill) return;
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
      revealSweepClaim(payload.rewardSummary, {
        catalog: (catalog ?? {}) as RevealCatalog,
        isPremium: !!isPremium,
        showFlyGainPill: false,
        moment: ratingMomentFor(target),
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
        initial: { opacity: 0, y: 6 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
        },
        exit: {
          opacity: 0,
          transition: { duration: 0.12, ease: 'easeOut' as const },
        },
      };

  // The Leap and the quests arrive from two different requests. Committing the
  // slot to whichever lands first is what made a refresh show a daily quest and
  // then visibly swap to the Leap a second later, so the slot waits until both
  // contenders are known before it picks one.
  const awaitingLeap = loading || (leapLoading && !leapView);

  useEffect(() => {
    void import('@/components/ui/QuestCards');
  }, []);

  const slotKey = awaitingLeap
    ? 'loading'
    : leapWins
      ? 'leap'
      : showClaimable && claimable
        ? `quest:${claimable.id}`
        : displayNextUp
          ? `quest:${displayNextUp.id}`
          : 'empty';

  const showsQuest = !awaitingLeap && !leapWins && (!!claimable || !!nextUp);

  const rowState: StatusDockRowState = readyClaim
    ? goldenClaim
      ? 'golden'
      : 'ready'
    : 'idle';

  const skeletonRow = (
    <div
      data-dock-row
      aria-hidden
      className={statusDockRowClass('idle', false)}
    >
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>
    </div>
  );

  const strip = awaitingLeap ? null : leapWins && liveLeap ? (
    <LeapStripRow view={liveLeap} />
  ) : !claimable && !nextUp ? null : (
    <div
      role="button"
      tabIndex={0}
      data-dock-row
      onClick={goToQuests}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goToQuests();
        }
      }}
      className={statusDockRowClass(rowState)}
    >
      {readyClaim || displayNextUp ? (
        <>
          <span className="min-h-11 min-w-11 shrink-0 rounded-xl">
            <QuestRewardTileBadge
              reward={(readyClaim ?? displayNextUp)?.reward}
              rewards={(readyClaim ?? displayNextUp)?.rewards}
              catalog={resolvedCatalog}
              isPremium={!!isPremium}
              small
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {!readyClaim && displayNextUp?.needsFocusTags ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold leading-tight text-foreground">
                  Pick a tag to start
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-background/70 px-2 py-0.5 text-[12px] font-black text-primary">
                  <Tags aria-hidden="true" className="h-3 w-3" strokeWidth={2.75} />
                  Pick a tag
                </span>
              </span>
            ) : (
              <>
                <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-bold leading-tight text-foreground">
                  {readyClaim && (
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#447d3f] text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={4} />
                    </span>
                  )}
                  <span className="min-w-0 truncate">
                  {readyClaim ? (
                    readyClaim.kind === 'season' ? (
                      readyClaim.seasonName
                        ? `${readyClaim.seasonName} · Tier ${readyClaim.tier}`
                        : `Season tier ${readyClaim.tier}`
                    ) : readyClaim.kind === 'sweep' ? (
                      sweepClaimLabels(readyClaim).title
                    ) : (
                      <ObjectiveLabel label={readyClaim.objectiveLabel} />
                    )
                  ) : displayNextUp ? (
                    <ObjectiveLabel
                      label={displayNextUp.remainingLabel}
                      tags={displayNextUp.tags}
                      maxTags={1}
                    />
                  ) : null}
                  </span>
                </span>
                <QuestTrack
                  progress={readyClaim ? 1 : trackProgress}
                  target={readyClaim ? 1 : (displayNextUp?.target ?? 1)}
                  entrance={claimEntrance}
                  action={
                    readyClaim
                      ? {
                          label: claiming
                            ? readyClaim.kind === 'sweep'
                              ? 'Opening…'
                              : 'Claiming…'
                            : readyClaim.kind === 'sweep'
                              ? sweepClaimLabels(readyClaim).action
                              : claimableCount > 1
                                ? `Claim · ${claimableCount} ready`
                                : 'Claim',
                          disabled: claiming,
                          onPress: () => void handleClaim(readyClaim),
                        }
                      : null
                  }
                />
              </>
            )}
          </div>
          {!readyClaim &&
          displayNextUp?.hint &&
          !displayNextUp.needsFocusTags ? (
            <span
              className="-mr-1.5 shrink-0 self-center"
              onClick={(event) => event.stopPropagation()}
            >
              <HintButton
                iconOnly
                placement="bottom"
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
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <>
    <QuestStripVisibility target={stripEl} covers={showsQuest} />
    {/* mode="wait" so the outgoing row finishes leaving before the next one
        arrives — two rows cross-fading in the same slot read as a glitch,
        one handing over to the other reads as a consequence. */}
    {awaitingLeap ? (
      skeletonRow
    ) : (
      <motion.div
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="md:h-full"
      >
        <AnimatePresence mode="wait" initial={false}>
          {strip && (
            <motion.div
              key={slotKey}
              ref={setStripEl}
              {...slotMotion}
              className="md:h-full"
            >
              {strip}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )}
    <div className="w-full border-t border-border/50 p-2 empty:hidden">
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
          'perishability: daily = 1 (gone at reset)',
          'reward = flies the NEXT action banks',
          'leap row: wins after a hop, when a mark is reachable today, or when nothing else is up',
        ]}
      />
    </div>
    </>
  );
}

function QuestStripVisibility({
  target,
  covers,
}: {
  target: HTMLElement | null;
  covers: boolean;
}) {
  useEffect(() => {
    if (!target || !covers) return;
    const observer = new IntersectionObserver(
      ([entry]) => setQuestStripOnScreen(entry.intersectionRatio >= 0.6),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      setQuestStripOnScreen(false);
    };
  }, [target, covers]);
  return null;
}
