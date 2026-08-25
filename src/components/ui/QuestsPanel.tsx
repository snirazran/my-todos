'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import { Icon } from '@/components/ui/Icon';
import { QuestsPageSkeleton } from '@/components/ui/Skeleton';
import {
  CalendarDays,
  Check,
  Clock,
  Gift,
  Lock,
  ScrollText,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  DailyQuestProgressView,
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestProgressView,
  QuestReward,
} from '@/lib/quests/types';
import {
  DailyChecklistCard,
  getRewardQuantityLabel,
  MoveToWebCard,
  RewardTile,
  sortStreakPrizes,
  StarterQuestCard,
  type DailySweepInfo,
  type MoveToWebInfo,
} from './QuestCards';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import { GiftRive } from './gift-box/GiftBox';
import Fly from './fly';
import { useInventory } from '@/hooks/useInventory';
import {
  enqueueQuestRewardReveal,
  type QuestRewardSummary,
  type RevealCatalog,
} from './questRewardReveal';
import {
  refreshQuestHomeView,
  takeQuestScrollTarget,
} from '@/lib/questClaims';
import { SingleRewardCard } from './daily-reward/RewardCard';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog, { type WardrobeSlot } from './frog';
import { PactAreaPanel } from '@/components/pact/PactAreaPanel';
import { PlusUpgradeModal } from './PlusUpgradeModal';

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  todoCount?: number;
  frogName?: string | null;
  tags?: Array<{ id: string; name: string; color: string; key?: string }>;
  dailySweep?: DailySweepInfo | null;
  moveToWeb?: MoveToWebInfo | null;
  onboarding: {
    complete: boolean;
    selectedCategoryIds: MacroCategoryId[];
    categoryTagMap: FocusCategoryTagMap[];
  };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  dailyQuestsGated?: boolean;
  dailyRerollsLeft?: number;
  firstOnboardingComplete?: boolean;
  earlyObjectiveSteps?: number;
  onboardingQuests?: QuestProgressView[];
  activeSeason?: QuestSeasonView | null;
  graceSeason?: QuestSeasonView | null;
  rewardCatalog: Record<string, ItemDef>;
};

type SeasonImages = {
  mobile: string;
  tablet: string;
  web: string;
  webLarge: string;
};

type QuestSeasonView = {
  id: string;
  name: string;
  images: SeasonImages;
  startsAt: string;
  endsAt: string;
  graceEndsAt: string;
  ended: boolean;
  tierCount: number;
  tier: number;
  steps: number;
  stepsPerTier: number;
  stepsIntoTier: number;
  tasksPerStep: number;
  maxStepsPerDay: number;
  tasksToday: number;
  stepsToday: number;
  dailyTaskGoal: number;
  tierSkipCost: number;
  flyBalance: number;
  purchasedTiers: number;
  isPremium: boolean;
  claimedFreeTiers: number[];
  claimedPlusTiers: number[];
  claimableFreeTiers: number[];
  claimablePlusTiers: number[];
  claimableCount: number;
  claimable: boolean;
  rewardsByTier: Array<{
    tier: number;
    freeRewards: QuestReward[];
    premiumRewards: QuestReward[];
  }>;
};

function SeasonCoverImage({
  images,
  alt,
  className,
}: {
  images: SeasonImages;
  alt: string;
  className?: string;
}) {
  const fallback =
    images.web || images.webLarge || images.tablet || images.mobile || '';
  if (!fallback) return null;
  return (
    <picture>
      {images.webLarge && (
        <source media="(min-width: 1920px)" srcSet={images.webLarge} />
      )}
      {images.web && <source media="(min-width: 1280px)" srcSet={images.web} />}
      {images.tablet && (
        <source media="(min-width: 768px)" srcSet={images.tablet} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images.mobile || fallback}
        alt={alt}
        width={1920}
        height={480}
        className={className}
      />
    </picture>
  );
}

function hasSeasonCover(images?: SeasonImages | null) {
  if (!images) return false;
  return !!(images.mobile || images.tablet || images.web || images.webLarge);
}

const fetcher = async <T,>(url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed');
  return res.json() as Promise<T>;
};

export function getQuestsUrl(timezone: string) {
  return `/api/quests?timezone=${encodeURIComponent(timezone)}`;
}

export function prefetchQuests() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  void preload(getQuestsUrl(timezone), fetcher);
}

// A quest is "finished" when every objective is done — i.e. claimed (for
// reward objectives) or simply complete (for objectives with no reward). This
// mirrors the card's own "all objectives done" state (see ObjectiveRow's
// `stepDone`), so the sort matches what the user sees.
function isQuestFinished(quest: QuestProgressView): boolean {
  if (quest.logic.length === 0) return quest.claimed;
  return quest.logic.every((block) => {
    const complete = block.progress >= Math.max(1, block.target);
    const hasRewards = (block.rewards?.length ?? 0) > 0;
    const claimed = quest.claimedObjectiveIds.includes(block.id);
    return claimed || (complete && !hasRewards);
  });
}

const EARLY_UNLOCK_STEP_TARGET = 5;

function DailyQuestsLockedCard({
  completedSteps,
  targetSteps,
}: {
  completedSteps: number;
  targetSteps: number;
}) {
  const safeTotal = Math.max(1, targetSteps);
  const shown = Math.max(0, Math.min(completedSteps, safeTotal));
  const pct = Math.min(100, (shown / safeTotal) * 100);
  const remaining = Math.max(0, safeTotal - shown);
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 pb-2 text-[13px] font-black text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 text-primary" strokeWidth={2.75} />
        Daily quests
      </div>
      <div className="relative overflow-hidden rounded-[24px] border border-primary/20 bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" />
        <div className="relative px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 shadow-sm shadow-emerald-900/10 dark:from-emerald-900/40 dark:to-emerald-950/40 dark:text-emerald-400">
              <Lock className="h-5 w-5" strokeWidth={2.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black leading-snug text-foreground">
                {remaining === 1
                  ? 'One step from daily quests'
                  : 'Finish your starter quests'}
              </p>
              <div className="relative mt-2 h-5 overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-[3px]">
                  <div
                    className="relative h-full min-w-8 overflow-hidden rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: pct > 0 ? `${pct}%` : '2rem' }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/30 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden"
                    />
                  </div>
                </div>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums text-foreground/70">
                  {shown}
                  {' / '}
                  {safeTotal}
                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums text-amber-950/80"
                  style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                >
                  {shown}
                  {' / '}
                  {safeTotal}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-bold leading-snug text-muted-foreground">
                Then new quests land every morning
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuestsPanel({
  isGuest,
  onQuestsChanged,
}: {
  isGuest?: boolean;
  onQuestsChanged?: () => void | Promise<void>;
}) {
  const [claimingObjectiveId, setClaimingObjectiveId] = useState<string | null>(
    null,
  );
  const [openSeasonKind, setOpenSeasonKind] = useState<
    'active' | 'grace' | null
  >(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusPlacement, setPlusPlacement] = useState('quests');
  const openPlus = (placement: string) => {
    setPlusPlacement(placement);
    setPlusOpen(true);
  };
  const [claimingSeason, setClaimingSeason] = useState(false);
  const [skippingTier, setSkippingTier] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const initialTopPinnedRef = useRef(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useInventory(!isGuest, true);

  const {
    data,
    error,
    isLoading,
    mutate: mutateQuests,
  } = useSWR<QuestsResponse>(
    !isGuest ? getQuestsUrl(timezone) : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
      keepPreviousData: true,
    },
  );

  const refreshQuestData = async () => {
    await mutateQuests();
    await onQuestsChanged?.();
    void refreshQuestHomeView();
  };

  const handleSwapDailies = async () => {
    if (swappingDailies) return;
    setSwappingDailies(true);
    try {
      const res = await fetch('/api/quests/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimMessage(payload?.error ?? 'Could not swap today’s quests');
        return;
      }
      await refreshQuestData();
    } finally {
      setSwappingDailies(false);
    }
  };

  const queueRewardReveal = (summary?: QuestRewardSummary) =>
    enqueueQuestRewardReveal(summary, {
      catalog: (data?.rewardCatalog ?? {}) as RevealCatalog,
      isPremium: data?.isPremium ?? false,
    });

  useEffect(() => {
    if (!claimMessage) return;
    const timeout = window.setTimeout(() => setClaimMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [claimMessage]);

  useEffect(() => {
    if (isLoading || !data || initialTopPinnedRef.current) return;

    const el = scrollContainerRef.current;
    if (!el) return;

    initialTopPinnedRef.current = true;
    el.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      el.scrollTop = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [data, isLoading]);

  const pendingScrollQuestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !data) return;
    if (!pendingScrollQuestIdRef.current) {
      pendingScrollQuestIdRef.current = takeQuestScrollTarget();
    }
    const questId = pendingScrollQuestIdRef.current;
    if (!questId) return;

    const timeout = window.setTimeout(() => {
      pendingScrollQuestIdRef.current = null;
      const anchors = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-quest-anchor~="${CSS.escape(questId)}"]`,
        ),
      );
      for (const el of anchors) {
        if (el.offsetParent === null) continue;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('quest-anchor-highlight');
        window.setTimeout(
          () => el.classList.remove('quest-anchor-highlight'),
          2000,
        );
        break;
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [isLoading, data]);

  const [claimingStreak, setClaimingStreak] = useState(false);
  const [swappingDailies, setSwappingDailies] = useState(false);
  const handleClaimStreak = async () => {
    if (claimingStreak) return;
    setClaimingStreak(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/streak/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary);
      // A Lily Pad is not part of the reveal pipeline, so the only place it
      // would otherwise show up is a silently changed shield count.
      if ((payload.rewardSummary?.shieldsGranted ?? 0) > 0) {
        setClaimMessage(
          payload.rewardSummary.shieldsGranted > 1
            ? `You rolled ${payload.rewardSummary.shieldsGranted} Lily Pads!`
            : 'You rolled a Lily Pad!',
        );
      }
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingStreak(false);
    }
  };

  const [claimingMoveToWeb, setClaimingMoveToWeb] = useState(false);
  const handleClaimMoveToWeb = async () => {
    if (claimingMoveToWeb) return;
    setClaimingMoveToWeb(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/move-to-web/claim', {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary);
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingMoveToWeb(false);
    }
  };

  const handleClaimObjective = async (questId: string, objectiveId: string) => {
    if (claimingObjectiveId) return;
    setClaimingObjectiveId(objectiveId);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/claim-objective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId, objectiveId, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary);
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingObjectiveId(null);
    }
  };

  const handleClaimSeason = async (
    seasonId: string | undefined,
    tier?: number,
    lane?: 'free' | 'plus',
  ) => {
    if (!seasonId || claimingSeason) return;
    setClaimingSeason(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/season/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, timezone, tier, lane }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary);
      // A Lily Pad has no reveal art of its own, so the only thing that would
      // otherwise change is a silent shield count.
      if ((payload.rewardSummary?.shieldsGranted ?? 0) > 0) {
        setClaimMessage(
          payload.rewardSummary.shieldsGranted > 1
            ? `You earned ${payload.rewardSummary.shieldsGranted} Lily Pads!`
            : 'You earned a Lily Pad!',
        );
      }
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingSeason(false);
    }
  };

  const handleSkipTier = async () => {
    const season = data?.activeSeason;
    if (!season || skippingTier) return;
    setSkippingTier(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/season/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: season.id, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not skip tier');
      setClaimMessage(`Tier ${payload.tier} unlocked for ${payload.fliesSpent} flies`);
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not skip tier');
    } finally {
      setSkippingTier(false);
    }
  };

  const renderContent = () => {
    return (
      <>
              <div className="relative z-10 flex-1 overflow-hidden md:flex-none md:overflow-visible">
                {isGuest ? (
                  <EmptyState
                    title="Sign in to unlock quests"
                    description="Quests use your tasks, timer sessions, and tags."
                  />
                ) : isLoading ? (
                  <QuestsPageSkeleton />
                ) : error || !data ? (
                  <EmptyState
                    title="Could not load quests"
                    description="Try reopening the popup."
                  />
                ) : (
                  <div className="flex flex-col h-full md:h-auto">
                    {claimMessage && (
                      <div className="px-4 pt-4 md:px-6">
                        <div
                          role="status"
                          aria-live="polite"
                          className="px-4 py-3 text-sm font-medium border rounded-2xl border-primary/20 bg-primary/10 text-foreground"
                        >
                          {claimMessage}
                        </div>
                      </div>
                    )}
                    <div
                      ref={(el) => {
                        scrollContainerRef.current = el;
                      }}
                      className={cn(
                        'no-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-none [overflow-anchor:none]',
                        'md:flex-none md:min-h-[100dvh] md:overflow-visible',
                        'bg-muted dark:bg-muted/25',
                        data.activeSeason
                          ? 'px-0 pt-0 md:px-0 md:pt-0 md:pb-8'
                          : 'px-4 pt-[calc(1rem+env(safe-area-inset-top))] md:px-8 md:pt-8 md:pb-8',
                        'pb-[calc(5rem+env(safe-area-inset-bottom))]',
                      )}
                    >
                      <div
                        className={cn(
                          'mx-auto flex w-full flex-col',
                          data.activeSeason ? 'max-w-none' : 'max-w-6xl',
                        )}
                      >
                        {data.activeSeason && (
                          <div className="w-full">
                            <QuestSeasonBanner
                              season={data.activeSeason}
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              flush
                              onView={() => setOpenSeasonKind('active')}
                            />
                          </div>
                        )}
                        <div className={cn(
                          "flex flex-col gap-8",
                          data.activeSeason && "relative z-10 -mt-8 pt-8 px-2.5 md:mx-auto md:mt-6 md:w-full md:max-w-6xl md:px-8 md:pt-0 bg-muted rounded-t-[24px] md:rounded-none md:bg-transparent"
                        )}>
                        {(() => {
                          const dailyQuests = data.dailyQuests ?? [];
                          const onboardingQuests = (data.onboardingQuests ?? []).filter(
                            (quest) => !isQuestFinished(quest),
                          );
                          const completedEarlyObjectives =
                            data.earlyObjectiveSteps ??
                            [
                              ...(data.onboardingQuests ?? []),
                              ...dailyQuests,
                            ].reduce(
                              (sum, quest) =>
                                sum +
                                quest.logic.filter(
                                  (block) =>
                                    block.progress >= Math.max(1, block.target),
                                ).length,
                              0,
                            );
                          const renderOnboardingCard = (quest: QuestProgressView) => (
                            <div
                              key={quest.id}
                              data-quest-anchor={quest.id}
                              className="rounded-[24px]"
                            >
                              <StarterQuestCard
                                quest={quest as QuestProgressView & { placement: 'onboarding' }}
                                rewardCatalog={data.rewardCatalog}
                                isPremium={data.isPremium}
                                claimingObjectiveId={claimingObjectiveId}
                                onClaimObjective={(objectiveId) =>
                                  handleClaimObjective(quest.id, objectiveId)
                                }
                                paused={false}
                              />
                            </div>
                          );
                          const dailyGroup = data.dailyQuestsGated ? (
                            <DailyQuestsLockedCard
                              completedSteps={completedEarlyObjectives}
                              targetSteps={EARLY_UNLOCK_STEP_TARGET}
                            />
                          ) : dailyQuests.length === 0 ? (
                            <PanelCard>No active daily quests here.</PanelCard>
                          ) : (
                            <DailyChecklistCard
                              quests={dailyQuests}
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              claimingObjectiveId={claimingObjectiveId}
                              onClaimObjective={handleClaimObjective}
                              sweep={data.dailySweep}
                              claimingSweep={claimingStreak}
                              onClaimSweep={handleClaimStreak}
                              swapsLeft={data.dailyRerollsLeft ?? 0}
                              swapping={swappingDailies}
                              onSwapQuests={handleSwapDailies}
                              paused={false}
                            />
                          );
                          const graceCard = data.graceSeason ? (
                            <SeasonGraceCard
                              season={data.graceSeason}
                              claiming={claimingSeason}
                              onOpen={() => setOpenSeasonKind('grace')}
                              onClaimAll={() =>
                                void handleClaimSeason(data.graceSeason?.id)
                              }
                            />
                          ) : null;
                          const dailySection = data.moveToWeb ? (
                            <div className="flex flex-col gap-2.5">
                              {dailyGroup}
                              <MoveToWebCard
                                moveToWeb={data.moveToWeb}
                                rewardCatalog={data.rewardCatalog}
                                isPremium={data.isPremium}
                                claiming={claimingMoveToWeb}
                                onClaim={handleClaimMoveToWeb}
                              />
                            </div>
                          ) : (
                            dailyGroup
                          );

                          // The weekly leap owns "which area am I on" now, so
                          // the areas slot is the pact and nothing else.
                          const showAreas =
                            data.firstOnboardingComplete ?? !data.dailyQuestsGated;

                          // One tree, laid out by CSS — never a mobile copy
                          // beside a desktop copy. `md:hidden` only hides:
                          // both branches still mounted, so the pact ran two
                          // PactCards and its settlement sheet, which portals
                          // out of the hidden subtree, opened twice.
                          return (
                            <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:items-start md:gap-6 lg:gap-8">
                              <div className="flex flex-col gap-8 md:gap-4">
                                {graceCard}
                                {onboardingQuests.length > 0 && (
                                  <div className="space-y-4">
                                    {onboardingQuests.map(renderOnboardingCard)}
                                  </div>
                                )}
                                <div>{dailySection}</div>
                              </div>
                              {showAreas && <PactAreaPanel />}
                            </div>
                          );
                        })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <QuestSeasonEventOverlay
                season={
                  openSeasonKind === 'grace'
                    ? data?.graceSeason ?? null
                    : data?.activeSeason ?? null
                }
                open={openSeasonKind !== null}
                rewardCatalog={data?.rewardCatalog ?? {}}
                isPremium={data?.isPremium ?? false}
                claiming={claimingSeason}
                skipping={skippingTier}
                onClose={() => setOpenSeasonKind(null)}
                onClaim={(tier, lane) =>
                  void handleClaimSeason(
                    openSeasonKind === 'grace'
                      ? data?.graceSeason?.id
                      : data?.activeSeason?.id,
                    tier,
                    lane,
                  )
                }
                onSkipTier={
                  openSeasonKind === 'active' ? handleSkipTier : undefined
                }
                onUpgrade={() => openPlus('season_plus_track')}
                paused={false}
              />
              <PlusUpgradeModal open={plusOpen} placement={plusPlacement} onClose={() => setPlusOpen(false)} />
      </>
    );
  };

  return (
    <>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background md:h-auto md:overflow-visible">
        {renderContent()}
      </div>

    </>
  );
}

function formatSeasonCountdown(endsAt: string) {
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Ended';
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function useSeasonCountdown(endsAt?: string) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!endsAt) {
      setLabel('');
      return;
    }
    const update = () => setLabel(formatSeasonCountdown(endsAt));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return label;
}

function seasonTierEntry(season: QuestSeasonView, tier: number) {
  return season.rewardsByTier.find((entry) => entry.tier === tier) ?? null;
}

/** The rung the board points at: the cheapest thing waiting, else the next one up. */
function seasonFocusTier(season: QuestSeasonView) {
  return (
    season.claimableFreeTiers[0] ??
    season.claimablePlusTiers[0] ??
    Math.min(season.tierCount, season.tier + 1)
  );
}

function seasonLaneStatus(
  season: QuestSeasonView,
  tier: number,
  lane: 'free' | 'plus',
): 'CLAIMED' | 'READY' | 'LOCKED' | 'LOCKED_PREMIUM' {
  const claimed =
    lane === 'free'
      ? season.claimedFreeTiers.includes(tier)
      : season.claimedPlusTiers.includes(tier);
  if (claimed) return 'CLAIMED';
  // A Plus rung stays visible-but-locked for free players at every tier: the
  // sunk progress behind you is the pitch, so it must never read as "missed".
  if (lane === 'plus' && !season.isPremium) return 'LOCKED_PREMIUM';
  return tier <= season.tier ? 'READY' : 'LOCKED';
}

function SeasonStepBar({
  season,
  paused = false,
  className,
}: {
  season: QuestSeasonView;
  paused?: boolean;
  className?: string;
}) {
  const goal = Math.max(1, season.dailyTaskGoal);
  const done = Math.min(season.tasksToday, goal);
  const pct = Math.min(100, (done / goal) * 100);
  const label = `${done} / ${goal}`;

  return (
    <div
      role="progressbar"
      aria-label={`${done} of ${goal} tasks completed today`}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={done}
      className={cn('relative overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="absolute inset-1">
        <div
          className="relative h-full overflow-hidden rounded-full bg-amber-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/30 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden"
          />
        </div>
      </div>
      {/* Two copies of the same label, the second clipped to the filled width
          in the bar's own dark tone — a single muted label sat unreadable on
          top of the amber in both themes. */}
      <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-black tabular-nums text-foreground/70">
        {label}
        <Fly size={26} y={-3} paused={paused} interactive={false} />
      </span>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-black tabular-nums text-amber-950"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        {label}
        <Fly size={26} y={-3} paused={paused} interactive={false} />
      </span>
    </div>
  );
}

function QuestSeasonBanner({
  season,
  rewardCatalog,
  isPremium,
  flush = false,
  onView,
}: {
  season: QuestSeasonView;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  flush?: boolean;
  onView: () => void;
}) {
  const timeLeft = useSeasonCountdown(season.endsAt);
  const focusTier = seasonFocusTier(season);
  const focusEntry = seasonTierEntry(season, focusTier);
  const previewReward =
    focusEntry?.freeRewards?.[0] ?? focusEntry?.premiumRewards?.[0];
  const seasonComplete =
    season.tier >= season.tierCount && season.claimableCount === 0;
  const stepsLeftToday = Math.max(
    0,
    season.maxStepsPerDay - season.stepsToday,
  );

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-card shadow-sm',
        flush
          ? 'rounded-none border-0 border-b border-border/50'
          : 'rounded-[28px] border border-border/50',
      )}
    >
      <div className={cn('relative overflow-hidden', flush ? 'h-[430px] md:h-[360px]' : 'h-[390px]')}>
        {hasSeasonCover(season.images) ? (
          <SeasonCoverImage
            images={season.images}
            alt={season.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 h-full w-full bg-[linear-gradient(135deg,#f59e0b_0%,#10b981_55%,#0f766e_100%)]" />
        )}
        {/* Same recessed inset feel as the home background photo. */}
        <div className="pointer-events-none absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset,rgba(0,0,0,0.15)_0px_-2px_5px_0px_inset]" />
        <div className="absolute inset-x-0 top-16 flex justify-center p-4 md:top-10 lg:top-12 xl:top-14">
          <div className="flex flex-col items-center gap-3 md:gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-base leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.9)] sm:text-lg md:text-xl"
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.95)',
                paintOrder: 'stroke fill',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="rgb(15 23 42)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" fill="white" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {timeLeft}
            </span>
            <h2
              className="max-w-[calc(100%-2rem)] text-center text-4xl leading-none tracking-wide text-white drop-shadow-[0_5px_0_rgba(15,23,42,0.95)] sm:text-5xl md:max-w-[38rem] md:text-5xl"
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '3px rgba(15, 23, 42, 0.95)',
                paintOrder: 'stroke fill',
              }}
            >
              {season.name}
            </h2>
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-14 z-10 mx-auto flex max-w-xl items-center gap-1.5 rounded-[24px] bg-background p-3 shadow-lg sm:gap-3">
          {seasonComplete ? (
            <>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                <Check className="h-8 w-8" strokeWidth={4} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black leading-tight text-foreground">
                  Season complete!
                  <br />
                  All {season.tierCount} tiers claimed
                </p>
              </div>
            </>
          ) : (
            <>
              {/* The count badge overhangs the tile's corner, so the copy needs
                  clearance the container's own gap doesn't give it. */}
              <div className="relative mr-2.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted/60 sm:mr-3 sm:h-20 sm:w-20">
                {previewReward ? (
                  <SeasonRewardPreview
                    reward={previewReward}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                    showRays
                  />
                ) : (
                  <Gift className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap font-black text-foreground text-[clamp(0.75rem,calc(5vw_-_0.25rem),1.125rem)] sm:whitespace-normal">
                  {season.claimableCount > 0
                    ? `Tier ${focusTier} unlocked!`
                    : `Tier ${season.tier} of ${season.tierCount}`}
                </p>
                <SeasonStepBar season={season} className="mt-2 h-8 sm:mt-3" />
                <p className="mt-1 hidden text-[11px] font-bold leading-none text-muted-foreground sm:block">
                  {stepsLeftToday > 0
                    ? `${season.tasksPerStep} tasks = 1 step · ${stepsLeftToday} left today`
                    : 'Both steps banked — back tomorrow'}
                </p>
              </div>
            </>
          )}
          <div className="relative flex w-[6.25rem] shrink-0 items-center min-[360px]:w-[6.75rem] sm:w-[9.5rem]">
            <button
              type="button"
              onClick={onView}
              className={cn(
                'w-full whitespace-nowrap rounded-2xl px-2 pb-3.5 pt-[1.125rem] text-[11px] font-black text-white transition active:translate-y-1 active:shadow-none min-[360px]:px-2.5 min-[360px]:text-[13px] sm:px-5 sm:text-base',
                season.claimable
                  ? 'bg-amber-500 shadow-[0_5px_0_#b45309]'
                  : 'bg-lime-600 shadow-[0_5px_0_#3f6212]',
              )}
            >
              {season.claimable
                ? 'Claim Rewards'
                : 'See Rewards'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The season just gone, for as long as its grace window runs. In `climb` mode
 * today's tasks still credit it, so this sits *beside* the new season rather
 * than delaying it — you climb both at once.
 */
function SeasonGraceCard({
  season,
  claiming,
  onOpen,
  onClaimAll,
}: {
  season: QuestSeasonView;
  claiming: boolean;
  onOpen: () => void;
  onClaimAll: () => void;
}) {
  const timeLeft = useSeasonCountdown(season.graceEndsAt);
  const canClimb = season.tier < season.tierCount;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 pb-2 text-[13px] font-black text-muted-foreground">
        <Clock className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.75} />
        Finish {season.name}
      </div>
      <div className="relative overflow-hidden rounded-[24px] border border-amber-400/30 bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-transparent" />
        <div className="relative flex items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={onOpen}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-sm dark:from-amber-900/40 dark:to-amber-950/40 dark:text-amber-300"
            aria-label={`Open ${season.name}`}
          >
            <span className="text-lg font-black tabular-nums">
              {season.tier}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black leading-snug text-foreground">
              {season.claimableCount > 0
                ? `${season.claimableCount} reward${season.claimableCount > 1 ? 's' : ''} still waiting`
                : `Tier ${season.tier} of ${season.tierCount}`}
            </p>
            <p className="mt-0.5 text-[11px] font-bold leading-snug text-muted-foreground">
              {canClimb
                ? `Today's tasks still count here · ${timeLeft} left`
                : `Collect before it closes · ${timeLeft} left`}
            </p>
          </div>
          <button
            type="button"
            onClick={season.claimableCount > 0 ? onClaimAll : onOpen}
            disabled={claiming}
            className="h-11 shrink-0 touch-manipulation rounded-xl bg-amber-500 px-4 text-xs font-black text-white shadow-[0_3px_0_#b45309] transition active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            {season.claimableCount > 0
              ? claiming
                ? 'Claiming…'
                : `Claim ${season.claimableCount}`
              : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeasonRewardPreview({
  reward,
  rewardCatalog,
  isPremium,
  paused = false,
  hideQuantityBadge = false,
  showRays = false,
  className,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  paused?: boolean;
  hideQuantityBadge?: boolean;
  showRays?: boolean;
  className?: string;
}) {
  const catalogId = reward.itemId ?? reward.backgroundId;
  const item = catalogId ? rewardCatalog[catalogId] : null;
  const isGift = item?.slot === 'container';
  const quantityLabel = getRewardQuantityLabel(reward, isPremium);

  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* The prize fills its frame instead of floating in it — overflow is
          clipped here so nothing spills onto the bar, while the count badge
          stays outside this box and rides the corner. */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-card">
        {showRays ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 z-0 animate-[spin_18s_linear_infinite] text-amber-400/55 motion-reduce:animate-none"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, transparent 0deg 14deg, currentColor 14deg 24deg, transparent 24deg 32deg)',
              maskImage:
                'radial-gradient(circle at center, black 0 48%, transparent 78%)',
              WebkitMaskImage:
                'radial-gradient(circle at center, black 0 48%, transparent 78%)',
            }}
          />
        ) : null}
        {isGift ? (
          <div className="relative z-10 h-[136%] w-[136%] -translate-y-[14%]">
            <GiftRive
              className="h-full w-full"
              color={item.riveIndex}
              paused={paused}
            />
          </div>
        ) : (
          <div
            className="relative z-10 flex h-full w-full items-center justify-center"
            style={{
              transform:
                reward.type === 'FLIES'
                  ? undefined
                  : reward.type === 'ITEM' && item
                    ? 'translateY(-9%) scale(1.35)'
                    : 'scale(1.35)',
            }}
          >
            <RewardTile
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              compact
              flySize={64}
              paused={paused}
              hideBadge
              className={cn(
                'h-full w-full rounded-2xl border-0 bg-transparent shadow-none',
                // Rendered at the desktop size and scaled down on the small
                // tile — downscaling keeps the canvas sharp, upscaling wouldn't.
                reward.type === 'FLIES' && 'scale-[0.82] sm:scale-100',
              )}
            />
          </div>
        )}
      </div>

      {!hideQuantityBadge && quantityLabel !== '×1' && (
        <div className="pointer-events-none absolute -right-1.5 -top-1.5 z-30 flex justify-center">
          <span className="flex min-w-5 items-center justify-center rounded-md border border-white/10 bg-black/50 px-1 py-0 text-[11px] font-bold leading-[16px] tracking-wide text-white shadow-sm backdrop-blur-sm">
            {quantityLabel}
          </span>
        </div>
      )}
    </div>
  );
}

type SeasonLaneState = ReturnType<typeof seasonLaneStatus>;

function seasonRewardName(
  reward: QuestReward,
  rewardCatalog: Record<string, ItemDef>,
) {
  const catalogId = reward.itemId ?? reward.backgroundId;
  const item = catalogId ? rewardCatalog[catalogId] : null;
  if (item?.name) return item.name;
  if (reward.type === 'FLIES') return 'Flies';
  if (reward.type === 'SHIELD') return 'Lily Pad';
  if (reward.type === 'BOX') return 'Mystery Box';
  if (reward.type === 'BACKGROUND') return 'Background';
  return 'Reward';
}

/**
 * A season prize gets its own card, even when a tier awards two things. Status
 * lives in the footer so the check/lock can never cover rarity or quantity.
 */
function SeasonPassRewardCard({
  reward,
  rewardCatalog,
  isPremium,
  status,
  paused = false,
  onClick,
  className,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  status: SeasonLaneState;
  paused?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const catalogId = reward.itemId ?? reward.backgroundId;
  const item = catalogId ? rewardCatalog[catalogId] : null;
  const rarity =
    item?.rarity ??
    (reward.type === 'FLIES' || reward.type === 'SHIELD'
      ? 'uncommon'
      : 'rare');
  const tone = GIFT_RARITY_CONFIG[rarity] ?? GIFT_RARITY_CONFIG.rare;
  const name = seasonRewardName(reward, rewardCatalog);
  const actionable = !!onClick;
  const statusLabel =
    status === 'CLAIMED'
      ? 'Collected'
      : status === 'READY'
        ? 'Claim'
        : status === 'LOCKED_PREMIUM'
          ? 'Plus'
          : 'Locked';
  const actionLabel =
    status === 'READY'
      ? `Claim ${name}`
      : status === 'LOCKED_PREMIUM'
        ? `Preview Plus reward: ${name}`
        : `${statusLabel}: ${name}`;

  const content = (
    <>
      <div className="relative h-[74px] w-full overflow-visible rounded-[14px]">
        <SeasonRewardPreview
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          paused={paused}
          className="h-full w-full"
        />
      </div>
      <div className="min-w-0 px-1 pb-1 pt-2 text-center">
        <div className="flex min-h-5 items-center justify-center">
          <span
            className={cn(
              'inline-flex min-h-5 items-center justify-center gap-1 rounded-full px-2 text-[10px] font-black',
              status === 'CLAIMED' &&
                'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
              status === 'READY' && 'bg-primary text-primary-foreground',
              status === 'LOCKED_PREMIUM' &&
                'bg-amber-400/20 text-amber-800 dark:text-amber-200',
              status === 'LOCKED' && 'bg-muted text-muted-foreground',
            )}
          >
            {status === 'CLAIMED' ? (
              <Check aria-hidden="true" className="h-3 w-3" strokeWidth={4} />
            ) : status === 'LOCKED_PREMIUM' ? (
              <Icon
                name="frogPlus"
                className="-my-1 h-5 w-5 drop-shadow-[0_1px_0_rgba(31,98,28,0.25)]"
              />
            ) : status === 'LOCKED' ? (
              <Lock aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
            ) : null}
            {statusLabel}
          </span>
        </div>
      </div>
    </>
  );

  const cardClassName = cn(
    'group relative mx-auto flex min-h-[126px] w-full max-w-[10rem] min-w-0 flex-col rounded-[18px] border-2 bg-card p-1.5 pb-1 shadow-sm',
    'transition-[transform,box-shadow,border-color,opacity] duration-150',
    tone.border,
    status === 'CLAIMED' && 'opacity-65',
    status === 'LOCKED' && 'opacity-55 grayscale-[0.35]',
    status === 'LOCKED_PREMIUM' && 'bg-amber-50/50 dark:bg-amber-950/20',
    actionable &&
      'touch-manipulation cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className,
  );

  if (actionable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel}
        className={cardClassName}
      >
        {content}
      </button>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

function QuestSeasonEventOverlay({
  season,
  open,
  rewardCatalog,
  isPremium,
  claiming,
  skipping,
  onClose,
  onClaim,
  onSkipTier,
  onUpgrade,
  paused = false,
}: {
  season: QuestSeasonView | null;
  open: boolean;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  claiming: boolean;
  skipping?: boolean;
  onClose: () => void;
  onClaim: (tier?: number, lane?: 'free' | 'plus') => void;
  onSkipTier?: () => void;
  onUpgrade?: () => void;
  paused?: boolean;
}) {
  const timeLeft = useSeasonCountdown(
    season?.ended ? season?.graceEndsAt : season?.endsAt,
  );
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const currentTierRef = useRef<HTMLDivElement | null>(null);
  const futureTierRowRef = useRef<HTMLDivElement | null>(null);
  const [greenLineHeight, setGreenLineHeight] = useState<string>('0px');
  const [greenLineWidth, setGreenLineWidth] = useState<string>('0px');
  const [lockedPreview, setLockedPreview] = useState<{
    tier: number;
    rewards: QuestReward[];
  } | null>(null);
  const [todayInView, setTodayInView] = useState(true);
  const [introDone, setIntroDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const { indices: wardrobeIndices } = useWardrobeIndices(open && !isPremium);

  const focusTier = season ? seasonFocusTier(season) : 1;

  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || e.pointerType !== 'mouse') return;
    if ((e.target as HTMLElement).closest('button, a, .interactive-reward')) return;

    isDragging.current = true;
    startX.current = e.pageX - scrollArea.offsetLeft;
    scrollLeftStart.current = scrollArea.scrollLeft;

    scrollArea.style.cursor = 'grabbing';
    scrollArea.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !scrollAreaRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollAreaRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollAreaRef.current.scrollLeft = scrollLeftStart.current - walk;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (scrollAreaRef.current) {
      scrollAreaRef.current.style.cursor = 'grab';
      scrollAreaRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const scrollToCurrent = () => {
    const isHorizontal = window.innerWidth >= 768;
    currentTierRef.current?.scrollIntoView({
      block: isHorizontal ? 'nearest' : 'center',
      inline: isHorizontal ? 'center' : 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    if (!open) return;
    const recompute = () => {
      const container = timelineRef.current;
      const target = currentTierRef.current;
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const isHorizontal = window.innerWidth >= 768;

      if (isHorizontal) {
        const center = targetRect.left + targetRect.width / 2 - containerRect.left;
        setGreenLineWidth(`${Math.max(0, center)}px`);
        setGreenLineHeight('8px');
      } else {
        const center = targetRect.top + targetRect.height / 2 - containerRect.top;
        setGreenLineHeight(`${Math.max(0, center)}px`);
        setGreenLineWidth('8px');
      }
    };
    recompute();
    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener('resize', recompute);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', recompute);
    };
  }, [open, focusTier, season?.tierCount]);

  useEffect(() => {
    if (!open || !season) return;

    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const current = currentTierRef.current;
    const future = futureTierRowRef.current;

    const isHorizontal = window.innerWidth >= 768;

    if (focusTier >= season.tierCount) {
      setTimeout(() => {
        current?.scrollIntoView({
          block: isHorizontal ? 'nearest' : 'center',
          inline: isHorizontal ? 'center' : 'nearest',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }, 100);
      return;
    }

    if (future) {
      scrollArea.style.scrollBehavior = 'auto';
      future.scrollIntoView({
        block: isHorizontal ? 'nearest' : 'center',
        inline: isHorizontal ? 'center' : 'nearest',
        behavior: 'auto',
      });
    } else {
      scrollArea.style.scrollBehavior = 'auto';
      if (isHorizontal) {
        scrollArea.scrollLeft = scrollArea.scrollWidth;
      } else {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }

    const timer = setTimeout(() => {
      if (!current) return;
      requestAnimationFrame(() => {
        current.scrollIntoView({
          block: isHorizontal ? 'nearest' : 'center',
          inline: isHorizontal ? 'center' : 'nearest',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [focusTier, open, reduceMotion, season?.tierCount]);

  useEffect(() => {
    if (!open) {
      setIntroDone(false);
      setTodayInView(true);
      return;
    }
    const timer = setTimeout(() => setIntroDone(true), 1000);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lockedPreview) setLockedPreview(null);
        else onClose();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lockedPreview, onClose, open]);

  useEffect(() => {
    if (!open) return;
    const root = scrollAreaRef.current;
    const target = currentTierRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTodayInView(entry.isIntersecting),
      { root, threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, focusTier, season?.tierCount]);

  if (!open || !season || typeof document === 'undefined') return null;

  const endsSoon =
    new Date(season.ended ? season.graceEndsAt : season.endsAt).getTime() -
      Date.now() <
    86_400_000;
  const seasonComplete =
    season.tier >= season.tierCount && season.claimableCount === 0;
  const canSkip =
    !season.ended &&
    season.tierSkipCost > 0 &&
    season.tier < season.tierCount &&
    !!onSkipTier;
  const canAffordSkip = season.flyBalance >= season.tierSkipCost;
  const previewTier = Math.min(season.tierCount, focusTier + 10);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-pass-title"
      className="fixed inset-0 z-[1200] flex flex-col overflow-x-hidden bg-background md:overflow-hidden"
    >
      <div className="relative h-[calc(210px+env(safe-area-inset-top))] shrink-0 overflow-hidden md:h-[220px] [@media(max-height:820px)]:md:h-[180px] [@media(max-height:720px)]:md:h-[140px]">
        {hasSeasonCover(season.images) ? (
          <SeasonCoverImage
            images={season.images}
            alt={season.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,#22c55e_0%,#14b8a6_55%,#064e3b_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/8 via-transparent to-black/12" />
        <button
          type="button"
          onClick={onClose}
          className="touch-manipulation absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition-[background-color,transform] hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close season pass"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pointer-events-none absolute inset-x-14 top-[calc(1.5rem+env(safe-area-inset-top))] flex justify-center px-2 md:inset-x-[15rem] md:top-16 md:px-4 [@media(max-height:820px)]:md:top-10 [@media(max-height:720px)]:md:top-6">
          <h2
            id="season-pass-title"
            className="max-w-[20rem] text-balance text-center text-3xl leading-none tracking-wide text-white drop-shadow-[0_4px_0_rgba(15,23,42,0.95)] sm:text-4xl md:text-4xl md:drop-shadow-[0_5px_0_rgba(15,23,42,0.95)] sm:md:text-5xl [@media(max-height:720px)]:md:text-3xl"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '3px rgba(15, 23, 42, 0.95)',
              paintOrder: 'stroke fill',
            }}
          >
            {season.name}
          </h2>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 md:inset-x-8 md:bottom-12 md:max-w-none md:px-0 [@media(min-width:400px)]:gap-3 [@media(min-width:400px)]:px-5">
          <div className="pointer-events-auto inline-flex h-10 items-center gap-2.5 rounded-full border border-white/20 bg-black/50 py-1 pl-1.5 pr-4 text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                endsSoon ? 'bg-amber-400 text-amber-950' : 'bg-white/15 text-white/90',
              )}
            >
              <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <span className="flex flex-col justify-center leading-none">
              <span className="text-[10px] font-bold text-white/60">
                {season.ended ? 'Closes in' : 'Ends in'}
              </span>
              <span className="mt-0.5 text-[13px] font-black leading-none tabular-nums">
                {timeLeft}
              </span>
            </span>
          </div>
          {!isPremium && onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              aria-label="Unlock Frog Plus"
              className="group pointer-events-auto relative isolate inline-flex h-12 min-w-0 items-center gap-1.5 rounded-2xl pl-2 pr-2 text-emerald-950 shadow-[0_12px_32px_-6px_rgba(217,119,6,0.55)] ring-2 ring-amber-200/80 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] [@media(min-width:400px)]:gap-2.5 [@media(min-width:400px)]:pl-3"
            >
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
              />
              <span
                aria-hidden
                className="animate-shimmer absolute inset-0 -z-10 overflow-hidden rounded-2xl bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.7)_50%,transparent_65%)] bg-[length:200%_100%] mix-blend-overlay motion-reduce:hidden"
              />
              <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent" />
              <span className="-my-8 -ml-2 -translate-y-2 inline-flex shrink-0">
                <Icon
                  name="frogPlus"
                  className="h-16 w-16 drop-shadow-[0_4px_0_rgba(31,98,28,0.35)] animate-wiggle motion-reduce:animate-none [@media(min-width:400px)]:h-20 [@media(min-width:400px)]:w-20"
                />
              </span>
              <span className="hidden text-[13px] font-black text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] [@media(min-width:360px)]:inline [@media(min-width:400px)]:tracking-[0.22em]">
                Unlock
              </span>
              <span className="ml-0.5 inline-flex shrink-0 items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[13px] font-black leading-none text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                Plus
              </span>
            </button>
          )}
        </div>
      </div>

      {/* One control bar: where you are, what's waiting, and the skip. */}
      <div className="sticky top-0 z-50 -mt-6 bg-transparent md:mt-0 md:shrink-0 md:border-b md:border-border/40 md:bg-muted/40 md:backdrop-blur-md">
        <div className="mx-auto w-full max-w-2xl rounded-t-[32px] bg-background md:max-w-4xl md:rounded-none md:bg-transparent">
          <div className="flex items-center gap-2.5 px-4 py-2.5 md:gap-3 md:py-2.5">
            <div
              className={cn(
                'flex h-10 shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 leading-none ring-1 md:h-11 md:px-3',
                seasonComplete
                  ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400'
                  : 'bg-primary/10 text-primary ring-primary/20',
              )}
            >
              <span className="text-[9px] font-black opacity-80">
                Tier
              </span>
              <span className="text-base font-black tabular-nums md:text-lg">
                {season.tier}
              </span>
            </div>

            {seasonComplete ? (
              <p className="min-w-0 flex-1 truncate text-sm font-black text-foreground">
                Season complete — all {season.tierCount} tiers claimed
              </p>
            ) : (
              <div className="min-w-0 flex-1">
                <SeasonStepBar
                  season={season}
                  paused={paused}
                  className="h-8 border border-border/60 md:h-9"
                />
                <p className="mt-1 hidden truncate text-[11px] font-bold text-muted-foreground sm:block">
                  {season.tasksPerStep} tasks = 1 step · {season.maxStepsPerDay}{' '}
                  steps a day max
                </p>
              </div>
            )}

            {canSkip && !season.claimable && (
              <button
                type="button"
                onClick={onSkipTier}
                disabled={skipping || !canAffordSkip}
                title={
                  canAffordSkip
                    ? `Skip to tier ${season.tier + 1}`
                    : `You need ${season.tierSkipCost - season.flyBalance} more flies`
                }
                className={cn(
                  'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1 rounded-2xl border px-2.5 text-[13px] font-black tracking-wide transition md:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  canAffordSkip
                    ? 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    : 'border-border/40 bg-muted/40 text-muted-foreground/50',
                  'disabled:cursor-not-allowed',
                )}
              >
                <span className="hidden [@media(min-width:420px)]:inline">
                  {skipping ? 'Skipping…' : 'Skip'}
                </span>
                <span className="tabular-nums">{season.tierSkipCost}</span>
                <Fly size={18} y={-2} paused={paused} interactive={false} />
              </button>
            )}

            {season.claimable && (
              <button
                type="button"
                onClick={() => onClaim()}
                disabled={claiming}
                className="inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-2xl bg-lime-600 px-4 text-xs font-black text-white shadow-[0_3px_0_#3f6212] transition active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:opacity-70 md:px-5 md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:ring-offset-2"
              >
                <Check className="h-4 w-4" strokeWidth={4} />
                {claiming ? 'Claiming…' : 'Claim All'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1"
        style={
          {
            '--tier-w': 'clamp(6.5rem, 13vw, 10.5rem)',
            '--tier-gap': 'clamp(0.75rem, 2.2vw, 2.5rem)',
          } as React.CSSProperties
        }
      >
        <div className="hidden md:z-20 md:flex md:sticky md:left-0 md:top-0 md:w-[5.5rem] md:shrink-0 md:flex-col md:self-stretch md:border-r md:border-border/40 md:bg-background lg:w-24">
          <div className="flex flex-1 items-center justify-center px-2">
            <span className="rounded-xl border border-primary/25 bg-primary/10 px-2.5 py-2 text-[12px] font-black text-primary">
              Free
            </span>
          </div>
          <div className="mx-auto h-px w-10 bg-border/60" aria-hidden="true" />
          <div className="flex flex-1 items-center justify-center px-2">
            <button
              type="button"
              onClick={isPremium ? undefined : onUpgrade}
              disabled={isPremium}
              aria-label={isPremium ? 'Frog Plus active' : 'Unlock Frog Plus'}
              className="group relative isolate flex flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[12px] font-black text-emerald-900 ring-2 ring-amber-200/80 transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-default"
            >
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(150deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
              />
              <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent" />
              <Icon name="frogPlus" className="h-9 w-9 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)]" />
              <span className="drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">Plus</span>
            </button>
          </div>
        </div>

        <div
          ref={scrollAreaRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="no-scrollbar relative min-h-0 flex-1 cursor-grab select-none overflow-y-auto [touch-action:pan-y] active:cursor-grabbing md:overflow-x-auto md:overflow-y-hidden md:[touch-action:pan-x]"
        >
          <div className="mx-auto min-h-full max-w-2xl bg-background md:mx-0 md:flex md:h-full md:min-w-full md:max-w-none md:flex-col md:justify-center md:bg-transparent md:px-8">
            <div className="relative z-10 mx-auto max-w-2xl bg-background md:mx-0 md:max-w-none md:bg-transparent">
              <div className="px-4 pb-5 pt-4 md:p-0 [@media(max-width:379px)]:px-2">
                <div className="text-foreground">
                  <div className="grid h-[52px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:hidden">
                    <div className="flex h-9 min-w-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-4 text-[13px] font-black text-primary">
                      Free
                    </div>
                    <div className="w-9" />
                    <button
                      type="button"
                      onClick={isPremium ? undefined : onUpgrade}
                      disabled={isPremium}
                      aria-label={isPremium ? 'Frog Plus active' : 'Unlock Frog Plus'}
                      className="group relative isolate flex h-11 min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl px-2.5 text-[13px] font-black text-emerald-900 ring-2 ring-amber-200/80 transition-transform enabled:active:scale-[0.98] disabled:cursor-default focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                      />
                      <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent" />
                      <Icon name="frogPlus" className="-my-4 h-9 w-9 shrink-0 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)]" />
                      <span className="drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                        Plus
                      </span>
                    </button>
                  </div>

                  <div
                    ref={timelineRef}
                    className="relative mt-3 md:mt-0 md:w-fit md:min-w-full md:py-6"
                  >
                    <div className="absolute bottom-0 left-1/2 top-0 z-0 w-2 -translate-x-1/2 rounded-full bg-border/60 md:left-0 md:right-0 md:top-1/2 md:h-2 md:w-auto md:-translate-y-1/2 md:translate-x-0" />
                    <div
                      className="absolute left-1/2 top-0 z-0 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_14px_rgba(34,197,94,0.28)] md:left-0 md:top-1/2 md:h-1 md:-translate-y-1/2 md:translate-x-0"
                      style={{ height: greenLineHeight, width: greenLineWidth }}
                    />

                    <div className="relative z-10 flex flex-col gap-y-4 md:flex-row md:gap-x-[var(--tier-gap)] md:gap-y-0">
                      {season.rewardsByTier.map((entry) => {
                        const isCurrent = entry.tier === focusTier;
                        const unlocked = entry.tier <= season.tier;
                        const freeStatus = seasonLaneStatus(season, entry.tier, 'free');
                        const plusStatus = seasonLaneStatus(season, entry.tier, 'plus');
                        const isPreviewStart = entry.tier === previewTier;
                        const hasMultipleRewards =
                          entry.freeRewards.length > 1 ||
                          entry.premiumRewards.length > 1;

                        // Every prize owns a real card. The lane shares one
                        // action/status, but the artwork and quantity never
                        // collapse into an ambiguous bundle.
                        const renderLane = (lane: 'free' | 'plus') => {
                          const laneRewards =
                            lane === 'free' ? entry.freeRewards : entry.premiumRewards;
                          if (laneRewards.length === 0) {
                            return (
                              <div className="flex h-[126px] w-full items-center justify-center rounded-[18px] border border-dashed border-border/50 px-2 text-center text-[10px] font-bold text-muted-foreground">
                                No reward
                              </div>
                            );
                          }
                          const sorted = sortStreakPrizes(laneRewards, rewardCatalog);
                          const status = lane === 'free' ? freeStatus : plusStatus;
                          const claimable = status === 'READY';
                          const canPitchPlus =
                            lane === 'plus' && status === 'LOCKED_PREMIUM';
                          const action = claimable
                            ? () => onClaim(entry.tier, lane)
                            : canPitchPlus
                              ? () =>
                                  setLockedPreview({
                                    tier: entry.tier,
                                    rewards: sorted,
                                  })
                              : undefined;

                          return (
                            <div
                              className={cn(
                                'relative grid w-full grid-cols-1 gap-2',
                                sorted.length > 1 &&
                                  'min-[480px]:grid-cols-2 md:grid-cols-2',
                              )}
                            >
                              {sorted.map((reward, rewardIndex) => (
                                <SeasonPassRewardCard
                                  key={`${entry.tier}-${lane}-${rewardIndex}-${reward.type}-${reward.itemId ?? reward.backgroundId ?? ''}`}
                                  reward={reward}
                                  rewardCatalog={rewardCatalog}
                                  isPremium={lane === 'plus'}
                                  status={status}
                                  paused={paused || !isCurrent}
                                  onClick={action}
                                />
                              ))}
                            </div>
                          );
                        };

                        return (
                          <div
                            key={entry.tier}
                            ref={isPreviewStart ? futureTierRowRef : undefined}
                            className={cn(
                              'relative grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)] items-center gap-x-1 rounded-3xl px-1 py-1.5 transition-colors duration-300',
                              'md:flex md:shrink-0 md:flex-col md:gap-x-0 md:px-0 md:py-3',
                              hasMultipleRewards
                                ? 'md:w-[calc(var(--tier-w)*2+0.5rem)]'
                                : 'md:w-[var(--tier-w)]',
                              '[@media(max-width:379px)]:grid-cols-[minmax(0,1fr)_2.25rem_minmax(0,1fr)]',
                            )}
                          >
                            <div className="flex w-full justify-center md:pb-5 [@media(max-height:800px)]:md:pb-3">
                              {renderLane('free')}
                            </div>

                            <div className="relative z-20 flex justify-center md:h-12 md:w-full md:items-center [@media(max-height:800px)]:md:h-9">
                              {isCurrent && (
                                <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-[18px] bg-primary/20 animate-ping-ring motion-reduce:hidden" />
                              )}
                              <div
                                ref={isCurrent ? currentTierRef : undefined}
                                className={cn(
                                  'relative z-10 flex h-11 w-11 flex-col items-center justify-center rounded-2xl leading-none',
                                  '[@media(max-width:379px)]:h-9 [@media(max-width:379px)]:w-9',
                                  '[@media(max-height:800px)]:md:h-9 [@media(max-height:800px)]:md:w-9',
                                  isCurrent
                                    ? 'bg-primary text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.18)] ring-2 ring-background'
                                    : unlocked
                                      ? 'bg-primary text-primary-foreground shadow-[0_3px_0_rgba(0,0,0,0.12)]'
                                      : 'border-2 border-border bg-background text-muted-foreground',
                                )}
                              >
                                <span className="text-[10px] font-black opacity-90 [@media(max-height:800px)]:md:hidden">
                                  Tier
                                </span>
                                <span className="text-base font-black tabular-nums [@media(max-width:379px)]:text-sm">
                                  {entry.tier}
                                </span>
                              </div>
                            </div>

                            <div className="flex w-full justify-center md:pt-5 [@media(max-height:800px)]:md:pt-3">
                              {renderLane('plus')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex justify-center md:bottom-8">
          <AnimatePresence>
            {introDone && !todayInView && (
              <motion.button
                key="back-to-tier"
                type="button"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
                onClick={scrollToCurrent}
                className="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-black text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.2),0_12px_28px_-8px_rgba(0,0,0,0.45)] ring-2 ring-background"
              >
                Back to Tier {focusTier}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {lockedPreview && (
          <LockedPlusPreview
            key="locked-plus-preview"
            tier={lockedPreview.tier}
            rewards={lockedPreview.rewards}
            rewardCatalog={rewardCatalog}
            wardrobeIndices={wardrobeIndices}
            onClose={() => setLockedPreview(null)}
            onUpgrade={() => {
              setLockedPreview(null);
              onUpgrade?.();
            }}
          />
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

function LockedPlusPreview({
  tier,
  rewards,
  rewardCatalog,
  wardrobeIndices,
  onClose,
  onUpgrade,
}: {
  tier: number;
  rewards: QuestReward[];
  rewardCatalog: Record<string, ItemDef>;
  wardrobeIndices: Partial<Record<string, number>>;
  onClose: () => void;
  onUpgrade?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { frogOnLeft, rotation } = useMemo(() => {
    const tilts = [-9, -6, -4, 4, 6, 9];
    return {
      frogOnLeft: Math.random() < 0.5,
      rotation: tilts[Math.floor(Math.random() * tilts.length)],
    };
  }, []);
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const offscreen = isDesktop ? '100vh' : '100%';
  const rewardDetailName = (reward: QuestReward) =>
    reward.type === 'FLIES'
      ? `${getRewardQuantityLabel(reward, true)} Flies`
      : reward.type === 'SHIELD' && (reward.amount ?? 1) > 1
        ? `${reward.amount} Lily Pads`
        : seasonRewardName(reward, rewardCatalog);
  const itemName = rewards.length
    ? rewards.map(rewardDetailName).join(' + ')
    : 'Plus Reward';
  const rewardCard = (reward: QuestReward, rewardIndex: number) => (
    <div
      key={`${tier}-${rewardIndex}-${reward.type}-${reward.itemId ?? reward.backgroundId ?? ''}`}
      className={cn(
        'relative shrink-0',
        rewards.length > 1
          ? 'w-28 min-[420px]:w-[7.75rem] md:w-[8.5rem]'
          : 'w-[9.375rem] md:w-[10rem]',
      )}
      style={{
        transform:
          rewards.length > 1
            ? `rotate(${rewardIndex === 0 ? -5 : 5}deg)`
            : `rotate(${rotation}deg)`,
      }}
    >
      <SingleRewardCard
        day={tier}
        rewardType={reward.type}
        amount={reward.amount}
        itemId={reward.itemId ?? reward.backgroundId}
        rewardCatalog={rewardCatalog}
        status="LOCKED_PREMIUM"
        isPremiumTier
        hideDayLabel
        hideDropRates
        hideSingleQuantity
        itemPreviewPosition={rewards.length > 1 ? 'lowered' : 'raised'}
        forceFullOpacity
        giftAnimation="box_shake"
      />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[1400] flex items-end justify-center md:items-center md:px-5"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close Plus reward preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plus-reward-title"
        drag={reduceMotion || isDesktop ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.y + info.velocity.y * 0.15 > 130 || info.velocity.y > 800)
            onClose();
        }}
        initial={reduceMotion ? { opacity: 0 } : { y: offscreen }}
        animate={{ y: 0 }}
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                y: offscreen,
                transition: {
                  type: 'tween',
                  duration: 0.3,
                  ease: [0.32, 0.72, 0, 1],
                },
              }
        }
        transition={{
          type: 'tween',
          ease: [0.32, 0.72, 0, 1],
          duration: reduceMotion ? 0.12 : 0.4,
        }}
        className="no-scrollbar relative max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-background px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.35)] md:max-w-md md:rounded-3xl md:px-6 md:pb-7 md:pt-5"
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30 md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Plus reward preview"
          className="touch-manipulation absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" />
        </button>

        {rewards.length > 1 ? (
          <div className="relative mx-auto mt-10 flex w-full max-w-[22rem] items-end justify-between px-1 md:mt-7">
            {rewardCard(rewards[0], 0)}
            <div className="absolute bottom-0 left-1/2 z-10 h-24 w-24 -translate-x-1/2 -translate-y-10 min-[420px]:h-28 min-[420px]:w-28">
              <Frog
                className="h-full w-full -translate-x-[20%]"
                width={144}
                height={144}
                indices={
                  {
                    ...wardrobeIndices,
                    mood: 2,
                  } as Partial<Record<WardrobeSlot, number>>
                }
              />
            </div>
            {rewardCard(rewards[1], 1)}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-center">
            <div
              className={cn(
                'relative z-10 h-44 w-44 shrink-0 -translate-y-4 md:h-48 md:w-48',
                frogOnLeft ? '-mr-12 md:-mr-14' : 'order-2 -ml-12 md:-ml-14',
              )}
            >
              <Frog
                className="h-full w-full"
                width={192}
                height={192}
                indices={
                  {
                    ...wardrobeIndices,
                    mood: 2,
                  } as Partial<Record<WardrobeSlot, number>>
                }
              />
            </div>
            <div className={frogOnLeft ? '' : 'order-1'}>
              {rewards[0] ? rewardCard(rewards[0], 0) : null}
            </div>
          </div>
        )}

        <div className={cn('text-center', rewards.length > 1 ? 'mt-2' : 'mt-4')}>
          <h3
            id="plus-reward-title"
            className="text-xl font-black tracking-tight text-foreground"
          >
            {itemName}
          </h3>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Unlock Tier {tier} with Plus
          </p>
        </div>

        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            aria-label="Unlock Frog Plus"
            className="group relative isolate mt-5 flex h-14 w-full touch-manipulation items-center justify-center gap-2.5 rounded-2xl px-4 text-emerald-950 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
          >
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
            />
            <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent" />
            <Icon
              name="frogPlus"
              className="-my-8 -ml-1 h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)]"
            />
            <span className="text-sm font-black text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
              Frogress
            </span>
            <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[13px] font-black leading-none text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
              Plus
            </span>
          </button>
        )}
      </motion.section>
    </motion.div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="w-full max-w-md rounded-[28px] border border-border/50 bg-card/90 p-8 text-center shadow-sm">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-3xl bg-primary/10 text-primary">
          <ScrollText className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}


function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-border/50 bg-muted/30 px-5 py-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
