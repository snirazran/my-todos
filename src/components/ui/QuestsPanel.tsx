'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { revealSweepClaim } from '@/components/ui/RewardRoll';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import { Icon } from '@/components/ui/Icon';
import { QuestsPageSkeleton } from '@/components/ui/Skeleton';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Gift,
  Lock,
  ScrollText,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';
import type { ItemDef, Rarity } from '@/lib/skins/catalog';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import type {
  DailyQuestProgressView,
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestReward,
} from '@/lib/quests/types';
import {
  DailyChecklistCard,
  getRewardQuantityLabel,
  MoveToWebCard,
  QUEST_ROW_CARD,
  QuestGoButton,
  QuestSectionHeader,
  RewardTile,
  sortStreakPrizes,
  type DailySweepInfo,
  type MoveToWebInfo,
} from './QuestCards';
import { GiftRive } from './gift-box/GiftBox';
import { useInventory } from '@/hooks/useInventory';
import {
  enqueueQuestRewardReveal,
  type QuestRewardSummary,
  type RevealCatalog,
} from './questRewardReveal';
import type { RatingMoment } from '@/lib/rateApp';
import { holdAutoPopups, QUEST_CLAIM_HOLD, releaseAutoPopups } from '@/lib/popupGate';
import { refreshQuestHomeView } from '@/lib/questClaims';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { preloadFrogFile, riveDevicePixelRatio } from '@/lib/riveLoader';
import { warmFrogStamps } from '@/lib/frogStampEngine';
import { useSeasonPalette, type SeasonPalette } from '@/lib/seasonPalette';
import Frog, { type WardrobeSlot } from './frog';
import Fly from './fly';
import { FrogSnapshot } from './FrogSnapshot';
import { LeapLeagueCard } from '@/components/leap/LeapLeagueCard';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { FrogPromptSheet, type FrogPromptBlock } from '@/components/quests/FrogPromptSheet';
import { MilestonesCard } from '@/components/quests/MilestonesCard';
import type { MilestoneBoardView } from '@/lib/quests/milestones';

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  todoCount?: number;
  frogName?: string | null;
  tags?: Array<{ id: string; name: string; color: string; key?: string }>;
  dailySweep?: DailySweepInfo | null;
  moveToWeb?: MoveToWebInfo | null;
  milestones?: MilestoneBoardView | null;
  onboarding: {
    complete: boolean;
    selectedCategoryIds: MacroCategoryId[];
    categoryTagMap: FocusCategoryTagMap[];
  };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  dailyRerollsLeft?: number;
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
  palette?: SeasonPalette | null;
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

function seasonCoverSrc(images?: SeasonImages | null) {
  return images?.mobile || images?.tablet || images?.web || images?.webLarge || null;
}

function seasonPaletteVars(palette: SeasonPalette): React.CSSProperties {
  return {
    '--season-band': palette.band,
    '--season-band-lip': palette.bandLip,
    '--season-accent': palette.accent,
    '--season-accent-lip': palette.accentLip,
    '--season-on-accent': palette.onAccent,
    '--season-soft': palette.soft,
    '--season-soft-text': palette.softText,
    '--season-soft-text-dark': palette.softTextDark,
    '--season-tint': palette.tint,
    '--season-fill': palette.fill,
    '--season-fill-strong': palette.fillStrong,
    '--season-on-fill': palette.onFill,
  } as React.CSSProperties;
}

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
  const [openSeasonKind, setOpenSeasonKindState] = useState<
    'active' | 'grace' | null
  >(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(OPEN_SEASON_KEY);
      return stored === 'active' || stored === 'grace' ? stored : null;
    } catch {
      return null;
    }
  });
  const setOpenSeasonKind = (kind: 'active' | 'grace' | null) => {
    setOpenSeasonKindState(kind);
    try {
      if (kind) sessionStorage.setItem(OPEN_SEASON_KEY, kind);
      else sessionStorage.removeItem(OPEN_SEASON_KEY);
    } catch {}
  };
  const [promptTarget, setPromptTarget] = useState<{
    questId: string;
    block: FrogPromptBlock;
  } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusPlacement, setPlusPlacement] = useState('quests');
  const openPlus = (placement: string) => {
    setPlusPlacement(placement);
    setPlusOpen(true);
  };
  const [claimingSeason, setClaimingSeason] = useState(false);
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
  const pagePalette = useSeasonPalette(
    seasonCoverSrc(data?.activeSeason?.images),
    data?.activeSeason?.palette,
  );

  const refreshQuestData = async () => {
    await mutateQuests();
    await onQuestsChanged?.();
    void refreshQuestHomeView();
  };

  const queueRewardReveal = (
    summary?: QuestRewardSummary,
    moment?: RatingMoment,
  ) =>
    enqueueQuestRewardReveal(summary, {
      catalog: (data?.rewardCatalog ?? {}) as RevealCatalog,
      isPremium: data?.isPremium ?? false,
      moment,
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

  const [claimingStreak, setClaimingStreak] = useState(false);
  const handleClaimStreak = async () => {
    if (claimingStreak) return;
    setClaimingStreak(true);
    setClaimMessage(null);
    holdAutoPopups(QUEST_CLAIM_HOLD);
    try {
      const res = await fetch('/api/quests/streak/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      revealSweepClaim(payload.rewardSummary, {
        catalog: (data?.rewardCatalog ?? {}) as RevealCatalog,
        isPremium: data?.isPremium ?? false,
        moment: 'clean_sweep',
      });
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
      releaseAutoPopups(QUEST_CLAIM_HOLD);
      setClaimingStreak(false);
    }
  };

  const [claimingMoveToWeb, setClaimingMoveToWeb] = useState(false);
  const handleClaimMoveToWeb = async () => {
    if (claimingMoveToWeb) return;
    setClaimingMoveToWeb(true);
    setClaimMessage(null);
    holdAutoPopups(QUEST_CLAIM_HOLD);
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
      releaseAutoPopups(QUEST_CLAIM_HOLD);
      setClaimingMoveToWeb(false);
    }
  };

  const [claimingMilestoneId, setClaimingMilestoneId] = useState<string | null>(null);
  const handleClaimMilestone = async (trackId: string) => {
    if (claimingMilestoneId) return;
    setClaimingMilestoneId(trackId);
    setClaimMessage(null);
    holdAutoPopups(QUEST_CLAIM_HOLD);
    try {
      const res = await fetch('/api/quests/milestones/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary, 'quest_reward');
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      releaseAutoPopups(QUEST_CLAIM_HOLD);
      setClaimingMilestoneId(null);
    }
  };

  const handleClaimObjective = async (questId: string, objectiveId: string) => {
    if (claimingObjectiveId) return;
    setClaimingObjectiveId(objectiveId);
    setClaimMessage(null);
    holdAutoPopups(QUEST_CLAIM_HOLD);
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
      releaseAutoPopups(QUEST_CLAIM_HOLD);
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
    holdAutoPopups(QUEST_CLAIM_HOLD);
    try {
      const res = await fetch('/api/quests/season/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, timezone, tier, lane }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary, 'quest_reward');
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
      releaseAutoPopups(QUEST_CLAIM_HOLD);
      setClaimingSeason(false);
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
                        'md:flex-none md:min-h-[100dvh] md:overflow-x-clip md:overflow-y-visible',
                        'bg-[hsl(var(--board-list))] dark:bg-background',
                        data.activeSeason
                          ? 'px-0 pt-0 md:pb-12'
                          : 'px-3 pt-[calc(1rem+env(safe-area-inset-top))] md:px-6 md:pt-24 md:pb-12',
                        'pb-[calc(6rem+env(safe-area-inset-bottom))]',
                      )}
                    >
                      {(() => {
                        const dailyQuests = data.dailyQuests ?? [];
                        const dailyCard = dailyQuests.length === 0 ? null : (
                          <DailyChecklistCard
                            quests={dailyQuests}
                            rewardCatalog={data.rewardCatalog}
                            isPremium={data.isPremium}
                            claimingObjectiveId={claimingObjectiveId}
                            onClaimObjective={handleClaimObjective}
                            sweep={data.dailySweep}
                            claimingSweep={claimingStreak}
                            onClaimSweep={handleClaimStreak}
                            onOpenSeason={data.activeSeason ? () => setOpenSeasonKind('active') : undefined}
                            claimingSeason={claimingSeason}
                            onClaimSeasonStep={(seasonId, tier) =>
                              void handleClaimSeason(seasonId, tier)
                            }
                            onAnswerPrompt={(questId, block) =>
                              setPromptTarget({ questId, block })
                            }
                            paused={false}
                          />
                        );
                        const claimable = data.claimableCount ?? 0;

                        return (
                          <>
                          {data.activeSeason && (
                            <QuestSeasonBanner
                              season={data.activeSeason}
                              onView={() => setOpenSeasonKind('active')}
                            />
                          )}
                          <div
                            className={cn(
                              'mx-auto flex w-full max-w-3xl flex-col gap-7 md:gap-9',
                              data.activeSeason &&
                                'relative z-10 -mt-6 bg-[hsl(var(--board-list))] px-3 pt-4 dark:bg-background md:-mt-8 md:bg-transparent md:px-6 md:pt-8 md:dark:bg-transparent',
                            )}
                          >
                            {data.activeSeason && (
                              <>
                                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 hidden w-screen -translate-x-1/2 bg-[hsl(var(--board-list))] dark:bg-background md:block" />
                                <PondWaveEdge />
                              </>
                            )}
                            {!data.activeSeason && (
                              <div className="flex items-end justify-between gap-3 px-3.5">
                                <h1 className="text-[30px] font-black leading-none tracking-tight text-foreground">
                                  Quests
                                </h1>
                                {claimable > 0 && (
                                  <span className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[12px] font-black text-white shadow-[0_2px_0_0_#b45309]">
                                    <Gift className="h-3.5 w-3.5" strokeWidth={2.75} />
                                    {claimable} ready
                                  </span>
                                )}
                              </div>
                            )}
                            {data.graceSeason && (
                              <SeasonGraceCard
                                season={data.graceSeason}
                                claiming={claimingSeason}
                                onOpen={() => setOpenSeasonKind('grace')}
                                onClaimAll={() =>
                                  void handleClaimSeason(data.graceSeason?.id)
                                }
                              />
                            )}
                            <LeapLeagueCard />
                            {dailyCard}
                            {data.milestones?.rows.length ? (
                              <MilestonesCard
                                rows={data.milestones.rows}
                                rewardCatalog={data.rewardCatalog}
                                isPremium={data.isPremium}
                                claimingTrackId={claimingMilestoneId}
                                onClaim={(trackId) => void handleClaimMilestone(trackId)}
                              />
                            ) : null}
                            {data.moveToWeb && (
                              <MoveToWebCard
                                moveToWeb={data.moveToWeb}
                                rewardCatalog={data.rewardCatalog}
                                isPremium={data.isPremium}
                                claiming={claimingMoveToWeb}
                                onClaim={handleClaimMoveToWeb}
                              />
                            )}
                          </div>
                          </>
                        );
                      })()}
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
                onUpgrade={() => openPlus('season_plus_track')}
                paused={false}
              />
              <PlusUpgradeModal open={plusOpen} placement={plusPlacement} onClose={() => setPlusOpen(false)} />
              <FrogPromptSheet
                open={!!promptTarget}
                questId={promptTarget?.questId ?? null}
                block={promptTarget?.block ?? null}
                frogName={data?.frogName}
                timezone={timezone}
                onClose={() => setPromptTarget(null)}
                onAnswered={async ({ rewardSummary }) => {
                  if (rewardSummary) {
                    queueRewardReveal(rewardSummary as QuestRewardSummary);
                  }
                  await refreshQuestData();
                }}
              />
      </>
    );
  };

  return (
    <>
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-background md:h-auto md:overflow-visible"
        style={data?.activeSeason ? seasonPaletteVars(pagePalette) : undefined}
      >
        {renderContent()}
      </div>

    </>
  );
}

const OPEN_SEASON_KEY = 'quests:openSeason';

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

export function SeasonLanePill({
  lane,
  isPremium = false,
  onUpgrade,
}: {
  lane: 'free' | 'plus';
  isPremium?: boolean;
  onUpgrade?: () => void;
}) {
  if (lane === 'free') {
    return (
      <span className="inline-flex h-9 items-center rounded-[12px] bg-[#e3efdb] px-4 text-[13px] font-black text-[#2f6b1f] dark:bg-white/[0.07] dark:text-foreground/80">
        Free
      </span>
    );
  }
  const className =
    'inline-flex h-9 items-center gap-1 rounded-[12px] bg-[#fff1c7] pl-1 pr-3.5 text-[13px] font-black text-[#7a5410] dark:bg-amber-400/15 dark:text-amber-200';
  const content = (
    <>
      <Icon name="frogPlus" className="-my-1 h-8 w-8 shrink-0" />
      Plus
    </>
  );
  return !isPremium && onUpgrade ? (
    <button
      type="button"
      onClick={onUpgrade}
      aria-label="Unlock the Plus reward track"
      className={cn(
        className,
        'touch-manipulation transition-colors hover:bg-[#ffe9a8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
      )}
    >
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}

const SEASON_SPARKLES = [
  { className: '-right-3 -top-2 h-4 w-4', delay: '0s' },
  { className: '-left-3 top-1/3 h-3 w-3', delay: '0.6s' },
  { className: '-right-2 bottom-3 h-2.5 w-2.5', delay: '1.1s' },
];

export function SeasonSparkles() {
  return (
    <>
      {SEASON_SPARKLES.map((sparkle) => (
        <svg
          key={sparkle.delay}
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn(
            'pointer-events-none absolute z-30 fill-amber-400 motion-reduce:hidden',
            sparkle.className,
          )}
          style={{
            animation: `plus-sparkle 1.8s ease-in-out ${sparkle.delay} infinite`,
          }}
        >
          <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
        </svg>
      ))}
    </>
  );
}

function PondWaveEdge() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-[calc(100%-1px)] left-1/2 h-[14px] w-screen -translate-x-1/2 overflow-hidden md:h-[20px]"
    >
      <div className="pond-wave bg-[hsl(var(--board-list))] dark:bg-background" />
    </div>
  );
}

function QuestSeasonBanner({
  season,
  onView,
}: {
  season: QuestSeasonView;
  onView: () => void;
}) {
  const timeLeft = useSeasonCountdown(season.endsAt);
  const waiting = season.claimableCount;

  return (
    <section className="relative">
      <div className="relative h-[calc(300px+env(safe-area-inset-top))] overflow-hidden md:h-[460px]">
        {hasSeasonCover(season.images) ? (
          <SeasonCoverImage
            images={season.images}
            alt={season.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 h-full w-full bg-[linear-gradient(135deg,#f59e0b_0%,#10b981_55%,#0f766e_100%)]" />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(5.5rem+env(safe-area-inset-top))] bg-[linear-gradient(to_bottom,rgba(15,23,42,0.28),transparent)]" />
        <div className="absolute inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] flex flex-col items-center gap-1.5 px-6 md:top-24 md:gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/40 py-1 pl-1.5 pr-2.5 text-[12px] font-black tabular-nums leading-none text-white backdrop-blur-sm md:text-[13px]">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            {timeLeft}
          </span>
          <h2
            className="max-w-[20rem] text-balance text-center text-[24px] leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.95)] md:max-w-[38rem] md:text-5xl md:drop-shadow-[0_5px_0_rgba(15,23,42,0.95)]"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '2px rgba(15, 23, 42, 0.95)',
              paintOrder: 'stroke fill',
            }}
          >
            {season.name}
          </h2>
        </div>
        <div className="absolute inset-x-0 bottom-[4rem] flex justify-center md:bottom-[5rem]">
          <button
            type="button"
            onClick={onView}
            aria-label={
              waiting > 0
                ? `View event, ${waiting} ${waiting === 1 ? 'reward' : 'rewards'} ready`
                : 'View event'
            }
            className="relative h-11 touch-manipulation rounded-[14px] bg-[var(--season-accent,#f28c1e)] px-7 text-[16px] font-black text-[var(--season-on-accent,#fff)] shadow-[0_4px_0_var(--season-accent-lip,#b45309),0_12px_24px_-8px_rgba(15,23,42,0.55)] ring-[2.5px] ring-white transition-[transform,box-shadow] duration-100 [text-shadow:0_1px_0_rgba(0,0,0,0.18)] active:translate-y-[4px] active:shadow-[0_0_0_var(--season-accent-lip,#b45309),0_6px_14px_-8px_rgba(15,23,42,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--season-accent,#f28c1e)]"
          >
            View Event
            {waiting > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-[12px] font-black tabular-nums leading-none text-white ring-2 ring-white [text-shadow:none]">
                {waiting}
              </span>
            )}
          </button>
        </div>
      </div>
    </section>
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
      <QuestSectionHeader
        title={`Finish ${season.name}`}
        right={
          <span className="inline-flex items-center gap-1 pr-1 text-[12px] font-black tabular-nums text-muted-foreground">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            {timeLeft}
          </span>
        }
      />
      <div
        className={cn(
          QUEST_ROW_CARD,
          'flex items-center gap-3 py-3 pl-3 pr-3',
          season.claimableCount > 0 && 'bg-amber-50 dark:bg-amber-500/10',
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 dark:from-amber-900/40 dark:to-amber-950/40 dark:text-amber-300"
          aria-label={`Open ${season.name}`}
        >
          <span className="text-lg font-black tabular-nums">{season.tier}</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight text-foreground">
            {season.claimableCount > 0
              ? `${season.claimableCount} reward${season.claimableCount > 1 ? 's' : ''} still waiting`
              : `Tier ${season.tier} of ${season.tierCount}`}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-muted-foreground">
            {canClimb ? 'Today’s tasks still count here' : 'Collect before it closes'}
          </p>
        </div>
        {season.claimableCount > 0 ? (
          <button
            type="button"
            onClick={onClaimAll}
            disabled={claiming}
            className="h-11 shrink-0 touch-manipulation rounded-[14px] bg-amber-500 px-4 text-[14px] font-black text-white shadow-[0_3px_0_#b45309] transition active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            {claiming ? 'Claiming…' : `Claim ${season.claimableCount}`}
          </button>
        ) : (
          <QuestGoButton onPress={onOpen} label={`Open ${season.name}`} />
        )}
      </div>
    </div>
  );
}

function useNearViewport(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (!enabled) {
      setNear(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: '240px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return near;
}

function useBoxWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.clientWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function SeasonRewardPreview({
  reward,
  rewardCatalog,
  isPremium,
  paused = false,
  hideQuantityBadge = false,
  showRays = false,
  still = false,
  bare = false,
  oversample = 1,
  dense = false,
  foil = null,
  className,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  paused?: boolean;
  hideQuantityBadge?: boolean;
  showRays?: boolean;
  still?: boolean;
  bare?: boolean;
  oversample?: number;
  dense?: boolean;
  foil?: Rarity | null;
  className?: string;
}) {
  const catalogId = reward.itemId ?? reward.backgroundId;
  const item = catalogId ? rewardCatalog[catalogId] : null;
  const isGift = item?.slot === 'container';
  const frameRef = useRef<HTMLDivElement | null>(null);
  const nearViewport = useNearViewport(frameRef, still && isGift);
  const quantityLabel = getRewardQuantityLabel(reward, isPremium);
  const box = useBoxWidth(frameRef);
  const frogIndices =
    reward.type === 'ITEM' && item && item.slot !== 'container'
      ? {
          skin: item.slot === 'skin' ? item.riveIndex : 0,
          mood: 0,
          hat: item.slot === 'hat' ? item.riveIndex : 0,
          body: item.slot === 'body' ? item.riveIndex : 0,
          hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
        }
      : null;
  const frogSize = Math.round(box * (dense ? 1.1 : 1.2));

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div
        ref={frameRef}
        className={cn(
          'absolute inset-0 flex items-center justify-center overflow-hidden rounded-[10px]',
          !bare && 'bg-card',
          (foil === 'epic' || foil === 'legendary') && 'closet-foil',
          foil === 'legendary' && 'closet-foil-gold',
        )}
      >
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
          <div className="relative z-10 h-[136%] w-[136%] -translate-y-[21%]">
            {nearViewport && (
              <GiftRive
                className="h-full w-full"
                color={item.riveIndex}
                paused={paused}
                oversample={oversample}
              />
            )}
          </div>
        ) : reward.type === 'FLIES' ? (
          box > 0 && (
            <div className="relative z-10">
              <Fly
                size={Math.round(box * (dense ? 0.92 : 0.62))}
                y={-1}
                paused={paused}
                interactive={false}
                oversample={oversample}
              />
            </div>
          )
        ) : frogIndices ? (
          box > 0 && (
            <div
              className="absolute z-10"
              style={{
                width: frogSize,
                height: frogSize,
                left: Math.round((box - frogSize) / 2),
                top: Math.round((box - frogSize) / 2 - frogSize * 0.31),
              }}
            >
              {still ? (
                <FrogSnapshot
                  indices={frogIndices}
                  width={frogSize}
                  height={frogSize}
                  oversample={oversample}
                />
              ) : (
                <Frog
                  indices={frogIndices}
                  width={frogSize}
                  height={frogSize}
                  paused={paused}
                  oversample={oversample}
                />
              )}
            </div>
          )
        ) : (
          <div className="relative z-10 flex h-full w-full items-center justify-center" style={{ transform: 'scale(1.4)' }}>
            <RewardTile
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              compact
              paused={paused}
              still={still}
              hideBadge
              className="h-full w-full rounded-xl border-0 bg-transparent shadow-none"
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

function seasonRewardRarity(
  reward: QuestReward,
  rewardCatalog: Record<string, ItemDef>,
): Rarity | null {
  if (reward.type === 'FLIES') return null;
  const catalogId = reward.itemId ?? reward.backgroundId;
  const rarity = catalogId ? rewardCatalog[catalogId]?.rarity : undefined;
  return rarity && rarity in RARITY_CONFIG ? rarity : null;
}

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

export function SeasonRewardTile({
  reward,
  rewardCatalog,
  lane,
  paused = false,
  compact = false,
  oversample = 1,
  tagRight = false,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, ItemDef>;
  lane: 'free' | 'plus';
  paused?: boolean;
  compact?: boolean;
  oversample?: number;
  tagRight?: boolean;
}) {
  const rarity = seasonRewardRarity(reward, rewardCatalog);
  const rawQuantity = getRewardQuantityLabel(reward, lane === 'plus');
  const quantity =
    rawQuantity === '×1'
      ? null
      : rawQuantity.startsWith('×')
        ? rawQuantity
        : `×${rawQuantity}`;
  const showTag = !compact && (!!rarity || !!quantity);
  return (
    <div
      className={cn(
        'relative aspect-square w-full border-2',
        compact ? 'rounded-[12px] p-0.5' : 'rounded-[16px] p-1',
        lane === 'plus'
          ? 'border-[#f2c75c] bg-gradient-to-b from-[#fff7df] to-[#ffe9ad] shadow-[0_4px_0_#e0b043] dark:border-amber-400/50 dark:from-amber-400/20 dark:to-amber-500/10 dark:shadow-[0_4px_0_rgba(180,120,20,0.5)]'
          : 'border-[#bcd9a9] bg-gradient-to-b from-[#f3faee] to-[#dcedcf] shadow-[0_4px_0_#a9cb93] dark:border-white/15 dark:from-white/[0.09] dark:to-white/[0.04] dark:shadow-[0_4px_0_rgba(0,0,0,0.4)]',
      )}
    >
      <SeasonRewardPreview
        reward={reward}
        rewardCatalog={rewardCatalog}
        isPremium={lane === 'plus'}
        paused={paused}
        still={paused}
        bare
        dense={compact}
        foil={rarity}
        oversample={oversample}
        hideQuantityBadge={!compact || reward.type !== 'FLIES'}
        className="h-full w-full"
      />
      {showTag && (
        <span
          className={cn(
            'absolute -top-[11px] z-20 inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[7px] border-[1.5px] bg-card px-1.5 font-black leading-none shadow-[0_1px_0_rgba(15,23,42,0.08)]',
            tagRight ? '-right-1.5' : 'left-1/2 -translate-x-1/2',
            rarity
              ? cn(RARITY_CONFIG[rarity].border, RARITY_CONFIG[rarity].text)
              : lane === 'plus'
                ? 'border-[#f2c75c] text-[#7a5410] dark:border-amber-400/50 dark:text-amber-200'
                : 'border-[#bcd9a9] text-[#2f6b1f] dark:border-white/20 dark:text-foreground/80',
          )}
        >
          {rarity && (
            <span className="text-[9.5px] uppercase tracking-[0.08em]">
              {RARITY_CONFIG[rarity].label}
            </span>
          )}
          {quantity && (
            <span className="text-[11px] tabular-nums tracking-tight">{quantity}</span>
          )}
        </span>
      )}
    </div>
  );
}

function QuestSeasonEventOverlay({
  season,
  open,
  rewardCatalog,
  isPremium,
  claiming,
  onClose,
  onClaim,
  onUpgrade,
  paused = false,
}: {
  season: QuestSeasonView | null;
  open: boolean;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  claiming: boolean;
  onClose: () => void;
  onClaim: (tier?: number, lane?: 'free' | 'plus') => void;
  onUpgrade?: () => void;
  paused?: boolean;
}) {
  const timeLeft = useSeasonCountdown(
    season?.ended ? season?.graceEndsAt : season?.endsAt,
  );
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const currentTierRef = useRef<HTMLDivElement | null>(null);
  const futureTierRowRef = useRef<HTMLDivElement | null>(null);
  const [lockedPreview, setLockedPreview] = useState<{
    tier: number;
    rewards: QuestReward[];
  } | null>(null);
  const [todayInView, setTodayInView] = useState(true);
  const [currentAbove, setCurrentAbove] = useState(true);
  const [introDone, setIntroDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const { indices: wardrobeIndices } = useWardrobeIndices(open && !isPremium);
  const palette = useSeasonPalette(seasonCoverSrc(season?.images), season?.palette);
  const warmLookKey = JSON.stringify(wardrobeIndices ?? {});

  useEffect(() => {
    if (!open || isPremium) return;
    let cancelWarm: (() => void) | null = null;
    let alive = true;
    const timer = window.setTimeout(() => {
      void preloadFrogFile().then((file) => {
        if (!alive || !file) return;
        cancelWarm = warmFrogStamps(
          [{ ...(JSON.parse(warmLookKey) as Record<string, number>), mood: 2 }],
          Math.round(176 * riveDevicePixelRatio()),
        );
      });
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      cancelWarm?.();
    };
  }, [open, isPremium, warmLookKey]);

  const focusTier = season ? seasonFocusTier(season) : 1;

  const scrollToCurrent = () => {
    currentTierRef.current?.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    if (!open || !season) return;

    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const current = currentTierRef.current;
    const future = futureTierRowRef.current;

    if (focusTier >= season.tierCount) {
      setTimeout(() => {
        current?.scrollIntoView({
          block: 'center',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }, 100);
      return;
    }

    scrollArea.style.scrollBehavior = 'auto';
    if (future) {
      future.scrollIntoView({ block: 'center', behavior: 'auto' });
    } else {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    const timer = setTimeout(() => {
      if (!current) return;
      requestAnimationFrame(() => {
        current.scrollIntoView({
          block: 'center',
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
      ([entry]) => {
        setTodayInView(entry.isIntersecting);
        const rootTop = entry.rootBounds?.top ?? 0;
        setCurrentAbove(entry.boundingClientRect.top < rootTop);
      },
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
  const previewTier = Math.min(season.tierCount, focusTier + 10);
  const waitingPlusRewards = season.rewardsByTier
    .filter((entry) =>
      entry.tier <= season.tier &&
      entry.premiumRewards.length > 0 &&
      !season.claimedPlusTiers.includes(entry.tier)
    )
    .map((entry) => ({
      tier: entry.tier,
      reward: sortStreakPrizes(entry.premiumRewards, rewardCatalog)[0],
    }));
  const waitingPlusTiers = waitingPlusRewards.length;
  const seasonMonth = new Date(season.startsAt)
    .toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    .toUpperCase();
  const nextTier = Math.min(season.tierCount, season.tier + 1);
  const doneToday =
    !season.ended &&
    season.tier < season.tierCount &&
    season.stepsToday >= season.maxStepsPerDay;
  const dailyGoal = Math.max(1, season.dailyTaskGoal);
  const dailyDone = Math.min(season.tasksToday, dailyGoal);
  const tasksLeft = dailyGoal - dailyDone;
  const showDailyBar =
    !seasonComplete &&
    !season.claimable &&
    !doneToday &&
    !season.ended &&
    season.tier < season.tierCount;
  const bandTitle = seasonComplete
    ? 'Season complete!'
    : season.claimable
      ? `${season.claimableCount} ${season.claimableCount === 1 ? 'reward' : 'rewards'} ready`
      : season.ended
        ? 'Season ended'
        : season.tier >= season.tierCount
          ? `All ${season.tierCount} tiers reached`
          : doneToday
            ? `Tier ${season.tier} reached!`
            : `${tasksLeft} more ${tasksLeft === 1 ? 'task' : 'tasks'} to Tier ${nextTier}`;
  const bandSub = seasonComplete
    ? `All ${season.tierCount} tiers collected`
    : season.claimable
      ? `Tier ${season.tier} of ${season.tierCount}`
      : season.ended
        ? season.tier < season.tierCount
          ? 'Today’s tasks still count here'
          : 'Collect before it closes'
        : doneToday
          ? `Come back tomorrow for Tier ${nextTier}`
          : '';
  const hasItem = (rewards: QuestReward[]) =>
    rewards.some((reward) => reward.type === 'ITEM');
  const tiersAhead = season.rewardsByTier.filter((entry) => entry.tier > season.tier);
  const goalEntry =
    tiersAhead.find(
      (entry) =>
        hasItem(entry.freeRewards) ||
        (isPremium && hasItem(entry.premiumRewards)),
    ) ??
    tiersAhead[tiersAhead.length - 1] ??
    null;
  const goalLane: 'free' | 'plus' =
    goalEntry && !hasItem(goalEntry.freeRewards) && isPremium && hasItem(goalEntry.premiumRewards)
      ? 'plus'
      : 'free';
  const goalReward = goalEntry
    ? (goalLane === 'plus'
        ? goalEntry.premiumRewards.find((reward) => reward.type === 'ITEM')
        : goalEntry.freeRewards.find((reward) => reward.type === 'ITEM') ??
          goalEntry.freeRewards[0]) ?? null
    : null;
  const scrollToTier = (tier: number) => {
    const row = scrollAreaRef.current?.querySelector<HTMLElement>(
      `[data-tier="${tier}"]`,
    );
    row?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-pass-title"
      className="fixed inset-0 z-[1200] flex flex-col overflow-x-hidden bg-background md:overflow-hidden"
      style={seasonPaletteVars(palette)}
    >
      <div className="relative h-[calc(236px+env(safe-area-inset-top))] shrink-0 overflow-hidden md:h-[220px] [@media(max-height:820px)]:md:h-[180px] [@media(max-height:720px)]:md:h-[140px]">
        {hasSeasonCover(season.images) ? (
          <SeasonCoverImage
            images={season.images}
            alt={season.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,#22c55e_0%,#14b8a6_55%,#064e3b_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent via-35% to-black/12 md:from-black/8" />
        <button
          type="button"
          onClick={onClose}
          className="touch-manipulation absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition-[background-color,transform] hover:bg-black/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close season pass"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pointer-events-none absolute inset-x-14 top-[calc(0.5rem+env(safe-area-inset-top))] flex flex-col items-center gap-1 px-2 md:inset-x-[15rem] md:gap-1.5 md:top-14 md:px-4 [@media(max-height:820px)]:md:top-8 [@media(max-height:720px)]:md:top-5">
          <span className="rounded-[7px] bg-black/35 px-2 py-0.5 text-[9.5px] font-black tracking-[0.14em] text-white/90 backdrop-blur-sm md:rounded-[8px] md:px-2.5 md:py-1 md:text-[10.5px]">
            {seasonMonth} SEASON
          </span>
          <h2
            id="season-pass-title"
            className="max-w-[20rem] text-balance text-center text-[24px] leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.95)] md:text-4xl md:drop-shadow-[0_5px_0_rgba(15,23,42,0.95)] sm:md:text-5xl [@media(max-height:720px)]:md:text-3xl"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '2.5px rgba(15, 23, 42, 0.95)',
              paintOrder: 'stroke fill',
            }}
          >
            {season.name}
          </h2>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 md:bottom-5 md:max-w-[36rem] [@media(min-width:400px)]:gap-3 [@media(min-width:400px)]:px-5">
          <div className="pointer-events-auto inline-flex h-10 items-center gap-2.5 rounded-[14px] border border-white/20 bg-black/50 py-1 pl-1.5 pr-4 text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]',
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
            <span className="plus-cta-sway shrink-0">
            <button
              type="button"
              onClick={onUpgrade}
              aria-label={`Unlock the season Plus reward track. ${waitingPlusTiers > 0 ? `Plus rewards at ${waitingPlusTiers} reached tiers are ready to claim after upgrading.` : 'Get an extra reward at every tier.'}`}
              style={{ ['--plus-button-base' as string]: '#b7791f' }}
              className="plus-upgrade-button pointer-events-auto relative h-12 min-w-0 shrink-0 touch-manipulation rounded-[14px] bg-[#f7bf33] pl-[3.4rem] pr-4 text-left text-[#3d2905] hover:brightness-105 focus-visible:outline-none"
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
                <span className="absolute inset-x-3 top-[3px] h-[5px] rounded-full bg-white/45" />
                <span className="absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-white/30 animate-[bar-shine-idle_3.2s_ease-in-out_infinite] motion-reduce:hidden" />
              </span>
              <Icon
                name="frogPlus"
                className="plus-cta-frog pointer-events-none absolute -left-1 -top-5 h-14 w-14 drop-shadow-[0_3px_0_rgba(120,80,10,0.35)]"
              />
              <span className="relative block text-[15px] font-black leading-tight">
                Unlock Plus
              </span>
              <span className="relative mt-0.5 block truncate text-[11px] font-bold leading-tight text-[#6b4a12]">
                {waitingPlusTiers > 0
                  ? `${waitingPlusTiers} ${waitingPlusTiers === 1 ? 'tier' : 'tiers'} ready to claim`
                  : 'Extra reward every tier'}
              </span>
            </button>
            </span>
          )}
          {isPremium && (
            <span className="pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/20 bg-black/50 py-1 pl-1 pr-3.5 text-[13px] font-black text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <Icon name="frogPlus" className="h-8 w-8" />
              Plus active
            </span>
          )}
        </div>
      </div>

      <div className="relative z-50 shrink-0 bg-[var(--season-band)] text-white shadow-[0_3px_0_var(--season-band-lip)]">
        <div className="mx-auto w-full max-w-[36rem]">
          <div className="px-4 py-3 [@media(min-width:400px)]:px-5">
            <div className="flex items-center gap-3">
              <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-white text-[22px] font-black tabular-nums text-[var(--season-band)] shadow-[0_3px_0_rgba(0,0,0,0.25)]">
                {season.tier}
                {(doneToday || seasonComplete) && (
                  <span className="absolute -bottom-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--season-accent)] ring-[3px] ring-[var(--season-band)]">
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black leading-tight md:text-base">
                  {bandTitle}
                </p>
                {showDailyBar ? (
                  <div
                    role="progressbar"
                    aria-label={`${dailyDone} of ${dailyGoal} tasks completed today`}
                    aria-valuemin={0}
                    aria-valuemax={dailyGoal}
                    aria-valuenow={dailyDone}
                    className="mt-1.5 flex items-center gap-2"
                  >
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
                        style={{ width: `${(dailyDone / dailyGoal) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-black tabular-nums text-white/80">
                      {dailyDone}/{dailyGoal}
                    </span>
                  </div>
                ) : bandSub ? (
                  <p className="mt-0.5 truncate text-[12.5px] font-bold text-white/70">
                    {bandSub}
                  </p>
                ) : null}
              </div>

              {season.claimable ? (
                <button
                  type="button"
                  onClick={() => onClaim()}
                  disabled={claiming}
                  className="inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-[14px] bg-[var(--season-accent)] px-4 text-[13px] font-black text-[var(--season-on-accent)] shadow-[0_3px_0_var(--season-accent-lip)] ring-1 ring-white/20 transition active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:opacity-70 md:px-5 md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Check className="h-4 w-4" strokeWidth={4} />
                  {claiming ? 'Claiming…' : 'Claim All'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 [--tile:clamp(5.5rem,25vw,7rem)] md:[--tile:7.75rem]"
      >
        <div
          ref={scrollAreaRef}
          className="no-scrollbar relative min-h-0 flex-1 select-none overflow-y-auto overscroll-contain md:bg-muted/40"
        >
          <div className="mx-auto min-h-full w-full bg-background md:max-w-[36rem] md:border-x md:border-border/50">
            <div className="relative z-10">
              <div className="pb-36">
                <div className="text-foreground">
                  <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-x-3 border-b border-border/50 bg-background px-[max(1.25rem,calc((100%_-_30rem)/2_+_1.25rem))] md:px-5 py-3 [@media(max-width:379px)]:px-3">
                    <div className="flex justify-center">
                      <SeasonLanePill lane="free" />
                    </div>
                    <div />
                    <div className="flex justify-center">
                      <SeasonLanePill lane="plus" isPremium={isPremium} onUpgrade={onUpgrade} />
                    </div>
                  </div>

                  <div className="relative">
                    {season.rewardsByTier.map((entry) => {
                      const isCurrent = entry.tier === focusTier;
                      const unlocked = entry.tier <= season.tier;
                      const isPreviewStart = entry.tier === previewTier;

                      const renderLane = (lane: 'free' | 'plus') => {
                        const laneRewards =
                          lane === 'free' ? entry.freeRewards : entry.premiumRewards;
                        if (laneRewards.length === 0) {
                          return (
                            <div
                              aria-hidden="true"
                              className="mx-auto aspect-square w-[var(--tile)] rounded-[16px] border-2 border-dashed border-border/50"
                            />
                          );
                        }
                        const sorted = sortStreakPrizes(laneRewards, rewardCatalog);
                        const status = seasonLaneStatus(season, entry.tier, lane);
                        const ready = status === 'READY';
                        const action = ready
                          ? () => onClaim(entry.tier, lane)
                          : lane === 'plus' && status === 'LOCKED_PREMIUM'
                            ? () => setLockedPreview({ tier: entry.tier, rewards: sorted })
                            : undefined;
                        const names = sorted
                          .map((reward) => {
                            const rarity = seasonRewardRarity(reward, rewardCatalog);
                            const name = seasonRewardName(reward, rewardCatalog);
                            return rarity ? `${RARITY_CONFIG[rarity].label} ${name}` : name;
                          })
                          .join(' + ');
                        const label =
                          status === 'READY'
                            ? `Claim tier ${entry.tier}: ${names}`
                            : status === 'LOCKED_PREMIUM'
                              ? `Preview Plus reward, tier ${entry.tier}: ${names}`
                              : status === 'CLAIMED'
                                ? `Collected, tier ${entry.tier}: ${names}`
                                : `Tier ${entry.tier}: ${names}`;
                        const wearable = (reward: QuestReward) =>
                          reward.type === 'ITEM' &&
                          !!rewardCatalog[reward.itemId ?? '']?.slot &&
                          rewardCatalog[reward.itemId ?? '']?.slot !== 'container';
                        const [main, ...extra] = [
                          ...sorted.filter(wearable),
                          ...sorted.filter((reward) => !wearable(reward) && reward.type === 'BOX'),
                          ...sorted.filter((reward) => !wearable(reward) && reward.type !== 'BOX'),
                        ];
                        const sparkle =
                          lane === 'plus' && (ready || status === 'LOCKED_PREMIUM');
                        const glow =
                          lane === 'plus' &&
                          (ready || (status === 'LOCKED_PREMIUM' && unlocked));
                        const body = (
                          <>
                            {glow && (
                              <span
                                aria-hidden="true"
                                className="absolute -inset-1.5 rounded-[20px] bg-amber-300/45 animate-ping-ring motion-reduce:hidden dark:hidden"
                              />
                            )}
                            {sparkle && <SeasonSparkles />}
                            <SeasonRewardTile
                              reward={main}
                              rewardCatalog={rewardCatalog}
                              lane={lane}
                              paused={paused || !isCurrent}
                              tagRight={extra.length > 0}
                            />
                            {extra.length > 0 && (
                              <div className="absolute -left-5 -top-5 z-10 w-[46%] -rotate-[8deg]">
                                <SeasonRewardTile
                                  reward={extra[0]}
                                  rewardCatalog={rewardCatalog}
                                  lane={lane}
                                  paused
                                  compact
                                  oversample={2}
                                />
                                {extra.length > 1 && (
                                  <span className="absolute -bottom-2 -left-1 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[10px] font-black text-background">
                                    +{extra.length - 1}
                                  </span>
                                )}
                              </div>
                            )}
                            {status === 'CLAIMED' && (
                              <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-[var(--season-accent)] shadow-[0_2px_0_var(--season-accent-lip)] ring-[3px] ring-background">
                                <Check className="h-4 w-4 text-white" strokeWidth={4} />
                              </span>
                            )}
                            {status === 'LOCKED_PREMIUM' && (
                              <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-[#ffe28d] to-[#f2b83d] shadow-[0_2px_0_#b7791f] ring-[3px] ring-background">
                                <Lock className="h-3.5 w-3.5 text-[#6b4a12]" strokeWidth={3} />
                              </span>
                            )}
                            {ready && (
                              <span className="absolute -bottom-4 left-1/2 z-20 -translate-x-1/2">
                                <span className="claim-wobble inline-flex">
                                  <span className="inline-flex h-8 items-center rounded-[10px] bg-[var(--season-accent)] px-4 text-[13px] font-black text-[var(--season-on-accent)] shadow-[0_3px_0_0_var(--season-accent-lip)] ring-2 ring-background">
                                    Claim
                                  </span>
                                </span>
                              </span>
                            )}
                          </>
                        );
                        const shell = cn(
                          'relative mx-auto block aspect-square w-[var(--tile)]',
                          status === 'LOCKED' && 'saturate-[0.85]',
                        );
                        return action ? (
                          <button
                            type="button"
                            onClick={action}
                            aria-label={label}
                            className={cn(
                              shell,
                              'interactive-reward touch-manipulation rounded-[16px] transition-transform duration-150 active:scale-95 [@media(hover:hover)]:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background',
                            )}
                          >
                            {body}
                          </button>
                        ) : (
                          <div role="img" aria-label={label} className={shell}>
                            {body}
                          </div>
                        );
                      };

                      return (
                        <div
                          key={entry.tier}
                          data-tier={entry.tier}
                          ref={isPreviewStart ? futureTierRowRef : undefined}
                          className={cn(
                            'relative grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-x-3 border-b border-border/50 px-[max(1.25rem,calc((100%_-_30rem)/2_+_1.25rem))] md:px-5 py-6 transition-colors duration-300 [@media(max-width:379px)]:px-3',
                            isCurrent && 'bg-[var(--season-tint)]',
                          )}
                        >
                          <div className="flex w-full justify-center">
                            {renderLane('free')}
                          </div>

                          <div className="relative z-20 flex justify-center">
                            <div
                              ref={isCurrent ? currentTierRef : undefined}
                              className={cn(
                                'relative flex min-w-[3.25rem] flex-col items-center justify-center rounded-[12px] px-2 py-1.5 leading-none',
                                isCurrent
                                  ? 'bg-[var(--season-accent)] text-[var(--season-on-accent)] shadow-[0_3px_0_var(--season-accent-lip)]'
                                  : unlocked
                                    ? 'bg-card text-[var(--season-soft-text)] shadow-[0_2px_0_rgba(15,23,42,0.07)] ring-1 ring-border/60 dark:text-[var(--season-soft-text-dark)]'
                                    : 'bg-card text-muted-foreground ring-1 ring-border/60',
                              )}
                            >
                              <span className="text-[9px] font-black uppercase tracking-[0.12em] opacity-80">
                                Tier
                              </span>
                              <span className="mt-0.5 text-[17px] font-black tabular-nums">
                                {entry.tier}
                              </span>
                            </div>
                          </div>

                          <div className="flex w-full justify-center">
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

        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-center gap-2.5 px-4 md:bottom-8">
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
                className="pointer-events-auto inline-flex h-10 touch-manipulation items-center gap-1.5 rounded-[14px] bg-card pl-2.5 pr-3.5 text-[13px] font-black text-[var(--season-soft-text)] dark:text-[var(--season-soft-text-dark)] shadow-[0_2px_0_0_rgba(15,23,42,0.08),0_4px_12px_-6px_rgba(15,23,42,0.18)] ring-1 ring-border/60 dark:shadow-[0_2px_0_0_rgba(0,0,0,0.4)]"
              >
                <span className="grid h-6 w-6 place-items-center rounded-[8px] bg-[var(--season-soft)] text-[var(--season-soft-text)] dark:text-[var(--season-soft-text-dark)]">
                  {currentAbove ? (
                    <ArrowUp className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <ArrowDown className="h-4 w-4" strokeWidth={3} />
                  )}
                </span>
                Back to Tier {focusTier}
              </motion.button>
            )}
          </AnimatePresence>
          {goalEntry && goalReward && !seasonComplete && (
            <button
              type="button"
              onClick={() => scrollToTier(goalEntry.tier)}
              aria-label={`Next big prize: tier ${goalEntry.tier}, ${seasonRewardName(goalReward, rewardCatalog)}. You are on tier ${season.tier}.`}
              className="pointer-events-auto flex w-full max-w-sm touch-manipulation items-center gap-3 rounded-[18px] bg-card py-2 pl-2 pr-4 text-left shadow-[0_12px_32px_-10px_rgba(15,23,42,0.45)] ring-1 ring-border/60 transition-transform active:scale-[0.98]"
            >
              <div className="h-14 w-14 shrink-0">
                <SeasonRewardTile
                  reward={goalReward}
                  rewardCatalog={rewardCatalog}
                  lane={goalLane}
                  paused
                  compact
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black leading-tight text-foreground">
                  Tier {goalEntry.tier}: {seasonRewardName(goalReward, rewardCatalog)}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--season-accent)]"
                      style={{ width: `${Math.min(100, (season.tier / goalEntry.tier) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11.5px] font-black tabular-nums text-muted-foreground">
                    {season.tier}/{goalEntry.tier}
                  </span>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lockedPreview && (
          <LockedPlusPreview
            key="locked-plus-preview"
            tier={lockedPreview.tier}
            reached={lockedPreview.tier <= season.tier}
            rewards={lockedPreview.rewards}
            rewardCatalog={rewardCatalog}
            wardrobeIndices={wardrobeIndices}
            currentTier={season.tier}
            waiting={waitingPlusRewards}
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
  reached,
  rewards,
  rewardCatalog,
  wardrobeIndices,
  currentTier,
  waiting = [],
  onClose,
  onUpgrade,
}: {
  tier: number;
  reached: boolean;
  rewards: QuestReward[];
  rewardCatalog: Record<string, ItemDef>;
  wardrobeIndices: Partial<Record<string, number>>;
  currentTier: number;
  waiting?: { tier: number; reward: QuestReward }[];
  onClose: () => void;
  onUpgrade?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { entered, markEntered } = useEntrance(true);
  const frogOnLeft = useMemo(() => Math.random() < 0.5, []);
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
  const others = waiting.filter((entry) => entry.tier !== tier);
  const readyCount = waiting.length;
  const tiersToGo = Math.max(0, tier - currentTier);
  const strip = others.slice(0, others.length > 5 ? 4 : 5);
  const stripMore = others.length - strip.length;
  const ctaLine = reached
    ? readyCount > 1
      ? `Claim all ${readyCount} rewards now`
      : 'Claim this reward now'
    : readyCount > 0
      ? `Claim your ${readyCount} ready ${readyCount === 1 ? 'reward' : 'rewards'} now`
      : 'Get an extra reward every tier';
  const featuredRarity =
    rewards
      .map((reward) => seasonRewardRarity(reward, rewardCatalog))
      .find((rarity): rarity is Rarity => !!rarity) ?? null;
  const shown = rewards.slice(0, 2);
  const look = useMemo(
    () => ({ ...wardrobeIndices, mood: 2 }) as Partial<Record<WardrobeSlot, number>>,
    [wardrobeIndices],
  );
  const [dressed, setDressed] = useState(false);
  const [underlay, setUnderlay] = useState(true);
  useEffect(() => {
    if (!dressed) return;
    const timer = window.setTimeout(() => setUnderlay(false), 220);
    return () => window.clearTimeout(timer);
  }, [dressed]);
  const frog = (
    <div className="relative z-20 h-44 w-44 shrink-0">
      {underlay && (
        <div className="pointer-events-none absolute inset-0">
          <FrogSnapshot width={176} height={176} indices={look} />
        </div>
      )}
      <Frog
        className="relative"
        width={176}
        height={176}
        indices={look}
        greet="hop"
        onDressed={() => setDressed(true)}
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
        onAnimationComplete={markEntered}
        className="no-scrollbar relative max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full overflow-y-auto overscroll-contain rounded-t-[24px] bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.35)] md:max-w-md md:rounded-[24px] md:px-6 md:pb-6 md:pt-5"
      >
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30 md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Plus reward preview"
          className="touch-manipulation absolute right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-[12px] bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" strokeWidth={2.75} />
        </button>

        <SheetEnteredContext.Provider value={entered}>
          <div className="relative mx-auto mt-4 flex h-48 w-full max-w-[21rem] items-end justify-center md:h-52">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[45%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.32)_0%,rgba(251,191,36,0.12)_40%,transparent_68%)]"
            />
            {frogOnLeft && <div className="-mr-10 mb-8">{frog}</div>}
            <div className="relative z-10 mb-10 flex items-end">
              {shown.map((reward, index) => (
                <div
                  key={`${tier}-${index}-${reward.type}-${reward.itemId ?? reward.backgroundId ?? ''}`}
                  className={cn(
                    'relative shrink-0',
                    shown.length > 1 ? 'w-[6.5rem] md:w-28' : 'w-32 md:w-36',
                    index > 0 && '-ml-3',
                  )}
                  style={{
                    transform: `rotate(${
                      shown.length > 1 ? (index === 0 ? -7 : 6) : frogOnLeft ? 5 : -5
                    }deg)`,
                  }}
                >
                  {index === 0 && <SeasonSparkles />}
                  <SeasonRewardTile
                    reward={reward}
                    rewardCatalog={rewardCatalog}
                    lane="plus"
                    oversample={2}
                    paused={
                      reward.type === 'ITEM' &&
                      rewardCatalog[reward.itemId ?? '']?.slot !== 'container'
                    }
                  />
                </div>
              ))}
            </div>
            {!frogOnLeft && <div className="-ml-10 mb-8">{frog}</div>}
          </div>
        </SheetEnteredContext.Provider>

        <div className="mt-5 flex flex-col items-center text-center">
          {reached ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-[9px] bg-[var(--season-soft)] pl-1.5 pr-2.5 text-[12px] font-black text-[var(--season-soft-text)] dark:text-[var(--season-soft-text-dark)]">
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--season-accent)]">
                <Check className="h-3 w-3 text-[var(--season-on-accent)]" strokeWidth={4} />
              </span>
              Tier {tier} reached
            </span>
          ) : (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-[9px] bg-muted px-2.5 text-[12px] font-black text-muted-foreground">
              <Lock className="h-3.5 w-3.5" strokeWidth={3} />
              Tier {tier} · {tiersToGo} {tiersToGo === 1 ? 'tier' : 'tiers'} to go
            </span>
          )}
          <h3
            id="plus-reward-title"
            className="mt-2.5 text-[22px] font-black leading-tight tracking-tight text-foreground"
          >
            {itemName}
          </h3>
          {featuredRarity && (
            <span
              className={cn(
                'mt-1 text-[11.5px] font-black uppercase tracking-[0.1em]',
                RARITY_CONFIG[featuredRarity].text,
              )}
            >
              {RARITY_CONFIG[featuredRarity].label}
            </span>
          )}
          <p className="mt-1 max-w-[19rem] text-balance text-[14px] font-semibold leading-snug text-muted-foreground">
            {reached
              ? 'You reached this tier. Unlock Plus and this reward is yours right away.'
              : `Plus members claim this reward at Tier ${tier}.`}
          </p>
        </div>

        {strip.length > 0 && (
          <div className="mt-5 rounded-[16px] bg-muted/60 px-3.5 pb-3.5 pt-3 dark:bg-white/[0.05]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-black text-foreground">
                {reached ? 'Also ready with Plus' : 'Ready with Plus right now'}
              </p>
              <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
                {others.length} {others.length === 1 ? 'reward' : 'rewards'}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              {strip.map((entry) => (
                <div key={entry.tier} className="min-w-0 max-w-[4rem] flex-1">
                  <SeasonRewardTile
                    reward={entry.reward}
                    rewardCatalog={rewardCatalog}
                    lane="plus"
                    paused
                    compact
                  />
                  <span className="mt-1 block text-center text-[10px] font-black tabular-nums text-muted-foreground">
                    Tier {entry.tier}
                  </span>
                </div>
              ))}
              {stripMore > 0 && (
                <div className="mb-[18px] grid aspect-square min-w-0 max-w-[4rem] flex-1 place-items-center rounded-[12px] border-2 border-dashed border-border text-[13px] font-black text-muted-foreground">
                  +{stripMore}
                </div>
              )}
            </div>
          </div>
        )}

        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            aria-label={`Unlock Plus. ${ctaLine}.`}
            style={{ ['--plus-button-base' as string]: '#b7791f' }}
            className="plus-upgrade-button relative mt-7 flex h-14 w-full touch-manipulation flex-col items-center justify-center rounded-[14px] bg-[#f7bf33] text-[#3d2905] hover:brightness-105 focus-visible:outline-none"
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
              <span className="absolute inset-x-4 top-[3px] h-[5px] rounded-full bg-white/45" />
              <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/30 animate-[bar-shine-idle_3.2s_ease-in-out_infinite] motion-reduce:hidden" />
            </span>
            <Icon
              name="frogPlus"
              className="plus-cta-frog pointer-events-none absolute -top-6 left-3 h-16 w-16 drop-shadow-[0_3px_0_rgba(120,80,10,0.35)]"
            />
            <span className="relative text-[16px] font-black leading-tight">Unlock Plus</span>
            <span className="relative mt-0.5 text-[11.5px] font-bold leading-tight text-[#6b4a12]">
              {ctaLine}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-3 flex h-10 items-center rounded-[12px] px-4 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          Maybe later
        </button>
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
