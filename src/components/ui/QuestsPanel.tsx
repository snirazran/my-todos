'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import useSWR, { preload } from 'swr';
import { Icon } from '@/components/ui/Icon';
import { QuestsPageSkeleton } from '@/components/ui/Skeleton';
import {
  CalendarDays,
  Check,
  Clock,
  Compass,
  Gift,
  Lock,
  ScrollText,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TagsPopup from './TagsPopup';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  CategoryQuestProgressView,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestProgressView,
  QuestReward,
} from '@/lib/quests/types';
import {
  AreaRow,
  AreaStartCard,
  CategoryQuestPresentationCard,
  DailyChecklistCard,
  getRewardQuantityLabel,
  RemoveTagConfirm,
  RewardTile,
  StarterQuestCard,
  SwitchFocusConfirm,
  type AreaRowState,
  type DailyStreakInfo,
  type QuestTagChip,
} from './QuestCards';
import { QuestStartSheet } from './QuestStartSheet';
import { SingleRewardCard } from './daily-reward/RewardCard';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import Fly from './fly';
import { useInventory } from '@/hooks/useInventory';
import {
  enqueueQuestRewardReveal,
  useQuestRevealQueueLength,
  type QuestRewardSummary,
  type RevealCatalog,
} from './questRewardReveal';
import {
  refreshQuestHomeView,
  takeQuestScrollTarget,
} from '@/lib/questClaims';
import {
  priorityReasonLabel,
  rankByQuestPriority,
} from '@/lib/quests/priority';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog, { type WardrobeSlot } from './frog';

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  todoCount?: number;
  areaQuestsUnlocked?: boolean;
  areaQuestsUnlockedAt?: string | null;
  frogName?: string | null;
  tags?: Array<{ id: string; name: string; color: string; key?: string }>;
  activeFocusCategoryId?: MacroCategoryId | null;
  rentedFocus?: {
    categoryId: MacroCategoryId;
    expiresAt: string | null;
  } | null;
  dailyStreak?: DailyStreakInfo | null;
  onboarding: {
    complete: boolean;
    selectedCategoryIds: MacroCategoryId[];
    categoryTagMap: FocusCategoryTagMap[];
  };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  dailyQuestsGated?: boolean;
  earlyObjectiveSteps?: number;
  categoryQuests: CategoryQuestProgressView[];
  onboardingQuests?: QuestProgressView[];
  activeSeason?: QuestSeasonView | null;
  rewardCatalog: Record<string, ItemDef>;
  unlockedAnimationIds: string[];
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
  dailyTargetFlies: number;
  currentDay: number;
  dayCount: number;
  progressFlies: number;
  claimedDays: number[];
  claimedToday: boolean;
  claimedTodayDay?: number;
  claimable: boolean;
  rewardsByDay: Array<{
    day: number;
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
      <img src={images.mobile || fallback} alt={alt} className={className} />
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

function isQuestExpired(quest: QuestProgressView): boolean {
  return (
    !!quest.expiresAt && new Date(quest.expiresAt).getTime() <= Date.now()
  );
}

// "Retired" quests render at the bottom: finished ones, and out-of-date (expired)
// ones that have nothing left to claim. A completed-but-unclaimed quest stays up
// top so the user can still collect it.
function isQuestRetired(quest: QuestProgressView): boolean {
  return (
    isQuestFinished(quest) || (isQuestExpired(quest) && !quest.claimable)
  );
}

function getFocusQuestSortScore(quest: CategoryQuestProgressView) {
  const openObjectives = quest.logic.filter(
    (block) => !quest.claimedObjectiveIds.includes(block.id),
  );

  if (openObjectives.length === 0) {
    return {
      claimable: 0,
      bestProgressRatio: 0,
      nearestRemaining: Number.MAX_SAFE_INTEGER,
      totalProgress: 0,
    };
  }

  let claimable = quest.claimable ? 1 : 0;
  let bestProgressRatio = 0;
  let nearestRemaining = Number.POSITIVE_INFINITY;
  let totalProgress = 0;

  openObjectives.forEach((block) => {
    const target = Math.max(1, block.target);
    const progress = Math.max(0, block.progress);
    const progressRatio = Math.min(progress / target, 1);
    const remaining = Math.max(0, target - progress);

    if (progress >= target) claimable = 1;
    bestProgressRatio = Math.max(bestProgressRatio, progressRatio);
    nearestRemaining = Math.min(nearestRemaining, remaining);
    totalProgress += progress;
  });

  return {
    claimable,
    bestProgressRatio,
    nearestRemaining: Number.isFinite(nearestRemaining)
      ? nearestRemaining
      : Number.MAX_SAFE_INTEGER,
    totalProgress,
  };
}

const AREA_UNLOCK_CELEBRATED_KEY = 'frog:areaQuestsUnlockCelebrated';

function AreaQuestsTeaser({
  completedSteps,
  targetSteps,
  unlocking,
}: {
  completedSteps: number;
  targetSteps: number;
  unlocking: boolean;
}) {
  const shownSteps = Math.min(completedSteps, targetSteps);
  const remaining = Math.max(1, targetSteps - shownSteps);
  const complete = shownSteps >= targetSteps;
  const pct = Math.min(100, (shownSteps / targetSteps) * 100);

  return (
    <motion.div
      data-area-unlock-anchor
      animate={
        unlocking
          ? { rotate: [0, -1.6, 1.6, -1.2, 1.2, -0.6, 0.6, 0], scale: 1.02 }
          : { rotate: 0, scale: 1 }
      }
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className={cn(
        'relative overflow-hidden rounded-[24px] border bg-card shadow-sm transition-colors duration-500',
        complete ? 'border-emerald-500/30' : 'border-primary/20',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent transition-opacity duration-500',
          complete ? 'from-emerald-500/[0.08]' : 'from-primary/[0.07]',
        )}
      />
      <div className="relative px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 shadow-sm transition-colors duration-500',
                'border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40 shadow-emerald-900/10',
                complete
                  ? 'text-emerald-500'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {complete ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : (
                <Lock className="h-5 w-5" strokeWidth={2.75} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black leading-snug text-foreground">
                {complete
                  ? 'Area quests unlocked!'
                  : `Complete ${remaining} more quest${remaining === 1 ? '' : 's'}`}
              </p>
              <div className="relative mt-2 h-5 overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-[3px]">
                  <div
                    className={cn(
                      'relative h-full min-w-8 overflow-hidden rounded-full transition-all duration-500',
                      complete ? 'bg-emerald-500' : 'bg-amber-400',
                    )}
                    style={{ width: pct > 0 ? `${pct}%` : '2rem' }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/30 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden"
                    />
                  </div>
                </div>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums text-foreground/70">
                  {shownSteps}
                  {' / '}
                  {targetSteps}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums',
                    complete ? 'text-emerald-950/80' : 'text-amber-950/80',
                  )}
                  style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                >
                  {shownSteps}
                  {' / '}
                  {targetSteps}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-bold leading-snug text-muted-foreground">
                {complete
                  ? 'Your life areas are ready below'
                  : 'Unlocks quests and rewards for the life areas you picked'}
              </p>
            </div>
          </div>
        </div>
    </motion.div>
  );
}

// Mirrors the "Your areas" locked card: daily quests stay behind the first
// onboarding quest so new users chase one goal at a time.
function DailyQuestsLockedCard({
  claimed,
  total,
  questName,
}: {
  claimed: number;
  total: number;
  questName?: string;
}) {
  const safeTotal = Math.max(1, total);
  const shown = Math.max(0, Math.min(claimed, safeTotal));
  const pct = Math.min(100, (shown / safeTotal) * 100);
  const remaining = Math.max(0, safeTotal - shown);
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 pb-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                Complete {remaining} more {remaining === 1 ? 'quest' : 'quests'}
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
                Finish {questName ?? 'your starter quest'} to unlock daily
                quests
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
  const [seasonEventOpen, setSeasonEventOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusPlacement, setPlusPlacement] = useState('quests');
  const openPlus = (placement: string) => {
    setPlusPlacement(placement);
    setPlusOpen(true);
  };
  const [claimingSeason, setClaimingSeason] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [editingFocusCategoryId, setEditingFocusCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [startQuestCategoryId, setStartQuestCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [areaUnlockCeremony, setAreaUnlockCeremony] = useState<
    'idle' | 'pending' | 'playing' | 'done'
  >('idle');
  const sawLockedAreasRef = useRef(false);
  const [pinnedCategoryId, setPinnedCategoryId] = useState<string | null>(null);
  const [pendingSwitchCategoryId, setPendingSwitchCategoryId] = useState<
    string | null
  >(null);
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

  const revealQueueLength = useQuestRevealQueueLength();
  const queueRewardReveal = (summary?: QuestRewardSummary) =>
    enqueueQuestRewardReveal(summary, {
      catalog: (data?.rewardCatalog ?? {}) as RevealCatalog,
      isPremium: data?.isPremium ?? false,
    });

  const serverAreaUnlocked = data?.areaQuestsUnlocked;
  const serverAreaUnlockedAt = data?.areaQuestsUnlockedAt;
  useEffect(() => {
    if (serverAreaUnlocked === false) {
      sawLockedAreasRef.current = true;
      return;
    }
    if (
      !serverAreaUnlocked ||
      areaUnlockCeremony !== 'idle' ||
      revealQueueLength > 0
    ) {
      return;
    }
    let shouldCelebrate = sawLockedAreasRef.current;
    if (!shouldCelebrate) {
      // First page visit after unlocking elsewhere: celebrate once per
      // device, and only while the unlock is still fresh.
      const unlockedAtMs = serverAreaUnlockedAt
        ? Date.parse(serverAreaUnlockedAt)
        : NaN;
      const fresh =
        Number.isFinite(unlockedAtMs) &&
        Date.now() - unlockedAtMs < 3 * 24 * 60 * 60 * 1000;
      let seen = false;
      try {
        seen =
          window.localStorage.getItem(AREA_UNLOCK_CELEBRATED_KEY) === '1';
      } catch {}
      shouldCelebrate = fresh && !seen;
    }
    if (!shouldCelebrate) return;
    try {
      window.localStorage.setItem(AREA_UNLOCK_CELEBRATED_KEY, '1');
    } catch {}
    setAreaUnlockCeremony('pending');
  }, [
    serverAreaUnlocked,
    serverAreaUnlockedAt,
    areaUnlockCeremony,
    revealQueueLength,
  ]);

  useEffect(() => {
    if (areaUnlockCeremony !== 'pending') return;
    const anchors = Array.from(
      document.querySelectorAll<HTMLElement>('[data-area-unlock-anchor]'),
    );
    const visible = anchors.find((el) => el.offsetParent !== null);
    visible?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timeout = window.setTimeout(
      () => setAreaUnlockCeremony('playing'),
      visible ? 750 : 150,
    );
    return () => window.clearTimeout(timeout);
  }, [areaUnlockCeremony]);

  useEffect(() => {
    if (areaUnlockCeremony !== 'playing') return;
    const confettiTimeout = window.setTimeout(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLElement>('[data-area-unlock-anchor]'),
      );
      const visible = anchors.find((el) => el.offsetParent !== null);
      const rect = visible?.getBoundingClientRect();
      const origin = rect
        ? {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight,
          }
        : { y: 0.55 };
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 38,
        origin,
        zIndex: 9999,
      });
      try {
        navigator.vibrate?.([20, 30, 40]);
      } catch {}
    }, 450);
    const doneTimeout = window.setTimeout(
      () => setAreaUnlockCeremony('done'),
      1500,
    );
    return () => {
      window.clearTimeout(confettiTimeout);
      window.clearTimeout(doneTimeout);
    };
  }, [areaUnlockCeremony]);

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

  const categoryMap = useMemo(
    () =>
      Object.fromEntries(
        (data?.macroCategories ?? []).map((entry) => [entry.id, entry]),
      ),
    [data?.macroCategories],
  );
  const selectedCategories = useMemo(
    () =>
      (data?.onboarding?.selectedCategoryIds ?? [])
        .map((id) => categoryMap[id])
        .filter(Boolean),
    [categoryMap, data?.onboarding?.selectedCategoryIds],
  );
  const categoryTagMap = useMemo(
    () =>
      new Map(
        (data?.onboarding?.categoryTagMap ?? []).map((entry) => [
          entry.categoryId,
          entry.tagIds,
        ]),
      ),
    [data?.onboarding?.categoryTagMap],
  );
  const tagAssignments = useMemo(() => {
    const assignments: Record<
      string,
      { categoryId: string; categoryName: string }
    > = {};
    for (const entry of data?.onboarding?.categoryTagMap ?? []) {
      const category = categoryMap[entry.categoryId];
      for (const tagId of entry.tagIds) {
        assignments[tagId] = {
          categoryId: entry.categoryId,
          categoryName: category?.shortLabel || category?.name || 'another focus area',
        };
      }
    }
    return assignments;
  }, [categoryMap, data?.onboarding?.categoryTagMap]);
  const tagCatalog = useMemo(
    () =>
      new Map(
        (data?.tags ?? []).map((tag, index) => {
          const id =
            typeof tag?.id === 'string' && tag.id.trim()
              ? tag.id.trim()
              : typeof tag?.name === 'string' && tag.name.trim()
                ? tag.name.trim()
                : `tag-${index}`;
          const name =
            typeof tag?.name === 'string' && tag.name.trim()
              ? tag.name.trim()
              : id;
          const color =
            typeof tag?.color === 'string' && tag.color.trim()
              ? tag.color.trim()
              : '#22c55e';
          return [id, { id, name, color }] as const;
        }),
      ),
    [data?.tags],
  );
  const filteredCategoryQuests = useMemo(() => {
    const quests = data?.categoryQuests ?? [];
    return [...quests].sort((a, b) => {
      const aScore = getFocusQuestSortScore(a);
      const bScore = getFocusQuestSortScore(b);

      return (
        Number(isQuestRetired(a)) - Number(isQuestRetired(b)) ||
        Number(a.locked ?? false) - Number(b.locked ?? false) ||
        bScore.claimable - aScore.claimable ||
        bScore.bestProgressRatio - aScore.bestProgressRatio ||
        aScore.nearestRemaining - bScore.nearestRemaining ||
        bScore.totalProgress - aScore.totalProgress
      );
    });
  }, [data?.categoryQuests]);

  const editingFocusCategory = editingFocusCategoryId
    ? categoryMap[editingFocusCategoryId]
    : null;

  // The hero card shows one focus quest: the free user's active focus, or the
  // premium user's pinned pick (falling back to the top-sorted quest). The
  // rest render as bench posters.
  const heroQuest = useMemo(() => {
    if (filteredCategoryQuests.length === 0) return null;
    if (data?.isPremium) {
      const pinned = pinnedCategoryId
        ? filteredCategoryQuests.find(
            (quest) => quest.categoryId === pinnedCategoryId,
          )
        : null;
      return pinned ?? filteredCategoryQuests[0];
    }
    const activeId = data?.activeFocusCategoryId;
    const active = activeId
      ? filteredCategoryQuests.find((quest) => quest.categoryId === activeId)
      : null;
    return (
      active ??
      filteredCategoryQuests.find((quest) => !(quest.locked ?? false)) ??
      filteredCategoryQuests[0]
    );
  }, [
    filteredCategoryQuests,
    data?.isPremium,
    data?.activeFocusCategoryId,
    pinnedCategoryId,
  ]);
  const benchQuests = useMemo(
    () =>
      filteredCategoryQuests.filter((quest) => quest.id !== heroQuest?.id),
    [filteredCategoryQuests, heroQuest?.id],
  );

  // "Up next" chips: the 2-3 areas most worth a session right now, so running
  // several areas in parallel doesn't quietly abandon the slow ones.
  const upNextAreas = useMemo(() => {
    const candidates = filteredCategoryQuests.filter((quest) => {
      if (quest.locked ?? false) return false;
      if (isQuestRetired(quest) || quest.claimable) return false;
      const linkedTags = categoryTagMap.get(quest.categoryId) ?? [];
      const needsTag =
        quest.logic.some((block) => block.tagMode === 'focus_category_tags') &&
        linkedTags.length === 0;
      return !needsTag;
    });
    if (candidates.length < 2) return [];
    return rankByQuestPriority(
      candidates.map((quest) => ({
        placement: 'category' as const,
        progress: quest.progress,
        target: quest.target,
        lastProgressAt: quest.lastProgressAt,
        expiresAt: quest.expiresAt,
        quest,
      })),
    ).slice(0, 3);
  }, [filteredCategoryQuests, categoryTagMap]);

  const handleUpNextPress = (quest: CategoryQuestProgressView) => {
    if (data?.isPremium) {
      setPinnedCategoryId(quest.categoryId);
    }
    window.setTimeout(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-quest-anchor~="${CSS.escape(quest.id)}"]`,
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
    }, 60);
  };
  const pendingSwitchCategory = pendingSwitchCategoryId
    ? categoryMap[pendingSwitchCategoryId]
    : null;

  const [claimingStreak, setClaimingStreak] = useState(false);
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
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingStreak(false);
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

  const [switchingFocusId, setSwitchingFocusId] = useState<string | null>(null);
  const handleSetActiveFocus = async (categoryId: string) => {
    if (switchingFocusId) return;
    setSwitchingFocusId(categoryId);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/active-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not switch focus');
      await refreshQuestData();
      setPendingSwitchCategoryId(null);
      const switchedQuest = (data?.categoryQuests ?? []).find(
        (q) => q.categoryId === categoryId,
      );
      const linkedTags = categoryTagMap.get(categoryId) ?? [];
      const needsTag =
        !!switchedQuest?.logic.some(
          (block) => block.tagMode === 'focus_category_tags',
        ) && linkedTags.length === 0;
      if (needsTag) {
        setStartQuestCategoryId(categoryId);
      }
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not switch focus');
    } finally {
      setSwitchingFocusId(null);
    }
  };

  const handleClaimSeasonDay = async () => {
    const season = data?.activeSeason;
    if (!season || claimingSeason) return;
    setClaimingSeason(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/season/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: season.id, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      queueRewardReveal(payload.rewardSummary);
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingSeason(false);
    }
  };

  const [pendingTagRemoval, setPendingTagRemoval] = useState<{
    categoryId: string;
    mode: 'remove' | 'switch';
    resolve: (proceed: boolean) => void;
  } | null>(null);

  const handleSaveFocusTags = async (categoryId: string, newTags: string[]) => {
    if (!data) return;
    // Warn whenever an original (still-existing) tag is dropped from the
    // selection — removing everything or switching to a different tag. Adding
    // more tags on top of the originals is safe and needs no warning.
    const originalTags = (categoryTagMap.get(categoryId) ?? []).filter(
      (tagId) => tagCatalog.has(tagId),
    );
    const droppedOriginal = originalTags.some(
      (tagId) => !newTags.includes(tagId),
    );
    if (originalTags.length > 0 && droppedOriginal) {
      const proceed = await new Promise<boolean>((resolve) =>
        setPendingTagRemoval({
          categoryId,
          mode: newTags.length === 0 ? 'remove' : 'switch',
          resolve,
        }),
      );
      setPendingTagRemoval(null);
      if (!proceed) return;
    }
    const nextTags = data.isPremium ? newTags : newTags.slice(0, 1);
    const nextTagSet = new Set(nextTags);

    const nextCategoryTagMap = (data.onboarding.categoryTagMap ?? [])
      .filter((entry) => entry.categoryId !== categoryId)
      .map((entry) => ({
        ...entry,
        tagIds: entry.tagIds.filter((tagId) => !nextTagSet.has(tagId)),
      }))
      .filter((entry) => entry.tagIds.length > 0);

    if (nextTags.length > 0) {
      nextCategoryTagMap.push({
        categoryId: categoryId as MacroCategoryId,
        tagIds: nextTags,
      });
    }

    const res = await fetch('/api/quests/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedCategoryIds: data.onboarding.selectedCategoryIds,
        categoryTagMap: nextCategoryTagMap,
        createSuggestions: false,
        timezone,
      }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Could not save focus tags');
    }
    await refreshQuestData();
  };

  const renderContent = () => {
    return (
      <>
              <div className="relative z-10 flex-1 overflow-hidden">
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
                  <div className="flex flex-col h-full">
                    {claimMessage && (
                      <div className="px-4 pt-4 md:px-6">
                        <div className="px-4 py-3 text-sm font-medium border rounded-2xl border-primary/20 bg-primary/10 text-foreground">
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
                              onView={() => setSeasonEventOpen(true)}
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

                          // Progressive disclosure: brand-new frogs only see the
                          // starter + daily quests. The server stamps
                          // areaQuestsUnlocked once earned (it never re-locks);
                          // the local calc is a fallback for stale payloads and
                          // still drives the teaser's progress dots.
                          // Must match AREA_UNLOCK_STEP_TARGET in
                          // api/quests/route.ts — the server decides the
                          // unlock, this only drives the card's display.
                          const FOCUS_UNLOCK_TARGET = 6;
                          // Server-computed lifetime count (includes past
                          // onboarding quests the display has retired); the
                          // local sum is only a stale-payload fallback.
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
                          const hasFocusFootprint =
                            (data.onboarding?.categoryTagMap?.length ?? 0) > 0 ||
                            filteredCategoryQuests.some(
                              (quest) =>
                                quest.claimedObjectiveIds.length > 0 ||
                                quest.logic.some((block) => block.progress > 0),
                            );
                          const focusUnlocked =
                            filteredCategoryQuests.length === 0 ||
                            (data.areaQuestsUnlocked ??
                              (hasFocusFootprint ||
                                completedEarlyObjectives >=
                                  FOCUS_UNLOCK_TARGET));
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
                          const renderFocusCard = (quest: CategoryQuestProgressView) => (
                            <div
                              key={quest.id}
                              data-quest-anchor={quest.id}
                              className="rounded-[24px]"
                            >
                            <CategoryQuestPresentationCard
                              quest={quest}
                              category={categoryMap[quest.categoryId]}
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              claimingObjectiveId={claimingObjectiveId}
                              linkedTags={
                                (categoryTagMap.get(quest.categoryId) ?? [])
                                  .map((tagId) => tagCatalog.get(tagId))
                                  .filter(Boolean) as QuestTagChip[]
                              }
                              onEditTags={() =>
                                setEditingFocusCategoryId(quest.categoryId)
                              }
                              onStartQuest={() =>
                                setStartQuestCategoryId(quest.categoryId)
                              }
                              onClaimObjective={(objectiveId) =>
                                handleClaimObjective(quest.id, objectiveId)
                              }
                              locked={quest.locked ?? false}
                              switchingFocus={switchingFocusId === quest.categoryId}
                              activeFocusName={
                                data.activeFocusCategoryId
                                  ? categoryMap[data.activeFocusCategoryId]
                                      ?.shortLabel ||
                                    categoryMap[data.activeFocusCategoryId]?.name
                                  : undefined
                              }
                              onActivateFocus={() =>
                                handleSetActiveFocus(quest.categoryId)
                              }
                              onUpgrade={() => openPlus('focus_quest_card')}
                              canRent={!data.isPremium && !data.rentedFocus}
                              rentedUntil={
                                data.rentedFocus?.categoryId === quest.categoryId
                                  ? data.rentedFocus?.expiresAt ?? null
                                  : null
                              }
                              onRented={() => mutateQuests()}
                              paused={false}
                            />
                            </div>
                          );

                          const focusEmptyStates = (
                            <>
                              {!data.onboarding?.complete && (
                                <PanelCard>
                                  Finish your onboarding on the home page to unlock
                                  quests for your focus areas.
                                </PanelCard>
                              )}
                              {data.onboarding?.complete &&
                                selectedCategories.length === 0 && (
                                  <PanelCard>
                                    Select at least one focus area to receive quests
                                    here.
                                  </PanelCard>
                                )}
                              {filteredCategoryQuests.length === 0 &&
                                data.onboarding?.complete &&
                                selectedCategories.length > 0 && (
                                  <PanelCard>No active focus quests here.</PanelCard>
                                )}
                            </>
                          );

                          // Until any area is started, no area gets promoted
                          // over the others: show an equal-footing chooser
                          // instead of hero + shelf.
                          // Tag-based quests count as started only while a
                          // tag is linked (unlinking returns to the chooser);
                          // tagless quests count via progress/claims instead.
                          // Resolve against the real tag catalog so ids left
                          // behind by a deleted tag don't count as linked.
                          const questStarted = (
                            quest: CategoryQuestProgressView,
                          ) => {
                            if (
                              quest.logic.some(
                                (block) =>
                                  block.tagMode === 'focus_category_tags',
                              )
                            ) {
                              return (
                                categoryTagMap.get(quest.categoryId) ?? []
                              ).some((tagId) => tagCatalog.has(tagId));
                            }
                            return (
                              quest.claimedObjectiveIds.length > 0 ||
                              quest.logic.some((block) => block.progress > 0)
                            );
                          };
                          // Chooser unless a quest that can actually run is
                          // started: for free users a started-but-locked area
                          // is dormant, so an unstarted active area still
                          // means "pick where to focus".
                          const chooserMode =
                            filteredCategoryQuests.length > 0 &&
                            !filteredCategoryQuests.some(
                              (quest) =>
                                questStarted(quest) &&
                                !(quest.locked ?? false),
                            );

                          const compactChooser =
                            filteredCategoryQuests.length > 4;
                          const areaChooser = (
                            <div className="flex flex-col gap-2 pb-6">
                              <div className="px-1">
                                <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                  <Compass
                                    className="h-3.5 w-3.5 text-primary"
                                    strokeWidth={2.75}
                                  />
                                  Your areas
                                </p>
                                <p className="mt-1.5 text-lg font-black leading-tight text-foreground">
                                  Where should{' '}
                                  {data.frogName?.trim() || 'your frog'} help
                                  first?
                                </p>
                                <p className="mt-0.5 text-xs font-bold text-muted-foreground/80">
                                  {data.isPremium
                                    ? 'Pick where you want to grow most — or run every area at once.'
                                    : 'Pick where you want to grow most.'}
                                </p>
                              </div>
                              <div
                                className={cn(
                                  'mt-0.5',
                                  compactChooser
                                    ? 'grid grid-cols-2 gap-3'
                                    : 'flex flex-col gap-3',
                                )}
                              >
                                {filteredCategoryQuests.map((quest) => (
                                  <div
                                    key={quest.id}
                                    data-quest-anchor={quest.id}
                                  >
                                    <AreaStartCard
                                      quest={quest}
                                      category={categoryMap[quest.categoryId]}
                                      compact={compactChooser}
                                      rewardCatalog={data.rewardCatalog}
                                      isPremium={data.isPremium}
                                      onPress={() =>
                                        setStartQuestCategoryId(
                                          quest.categoryId,
                                        )
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                          const gateQuest = (data.onboardingQuests ?? [])[0];
                          const gateBlocks = gateQuest?.logic ?? [];
                          const gateDone = gateBlocks.filter(
                            (block) =>
                              block.progress >= Math.max(1, block.target),
                          ).length;
                          const dailySection = data.dailyQuestsGated ? (
                            <DailyQuestsLockedCard
                              claimed={gateDone}
                              total={gateBlocks.length}
                              questName={gateQuest?.title}
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
                                streak={data.dailyStreak}
                                claimingStreak={claimingStreak}
                                onClaimStreak={handleClaimStreak}
                                paused={false}
                              />
                            );

                          // Free users with many paused areas get the same
                          // compact 2-col grid as the chooser; premium keeps
                          // rows (their progress bars carry real info).
                          const benchGrid =
                            !data.isPremium && benchQuests.length > 4;
                          const areaRows = benchQuests.length > 0 && (
                            <div
                              className={cn(
                                'mt-0.5',
                                benchGrid
                                  ? 'grid grid-cols-2 gap-3'
                                  : 'flex flex-col gap-2.5',
                              )}
                            >
                              {benchQuests.map((quest) => {
                                const linkedTags = (
                                  categoryTagMap.get(quest.categoryId) ?? []
                                )
                                  .map((tagId) => tagCatalog.get(tagId))
                                  .filter(Boolean) as QuestTagChip[];
                                const needsTag =
                                  quest.logic.some(
                                    (block) =>
                                      block.tagMode === 'focus_category_tags',
                                  ) && linkedTags.length === 0;
                                const rowState: AreaRowState = data.isPremium
                                  ? needsTag
                                    ? 'start'
                                    : 'running'
                                  : quest.locked
                                    ? 'paused'
                                    : needsTag
                                      ? 'start'
                                      : 'running';
                                const handlePress = () => {
                                  if (needsTag && !quest.locked) {
                                    setStartQuestCategoryId(quest.categoryId);
                                  } else if (data.isPremium) {
                                    setPinnedCategoryId(quest.categoryId);
                                  } else if (quest.locked) {
                                    setPendingSwitchCategoryId(
                                      quest.categoryId,
                                    );
                                  }
                                };
                                return (
                                  <div
                                    key={quest.id}
                                    data-quest-anchor={quest.id}
                                  >
                                    {benchGrid ? (
                                      <AreaStartCard
                                        quest={quest}
                                        category={
                                          categoryMap[quest.categoryId]
                                        }
                                        compact
                                        rewardCatalog={data.rewardCatalog}
                                        isPremium={data.isPremium}
                                        onPress={handlePress}
                                      />
                                    ) : (
                                      <AreaRow
                                        quest={quest}
                                        category={
                                          categoryMap[quest.categoryId]
                                        }
                                        state={rowState}
                                        finished={isQuestRetired(quest)}
                                        linkedTags={linkedTags}
                                        rewardCatalog={data.rewardCatalog}
                                        isPremium={data.isPremium}
                                        onPress={handlePress}
                                        rentedUntil={
                                          data.rentedFocus?.categoryId ===
                                          quest.categoryId
                                            ? data.rentedFocus?.expiresAt ??
                                              null
                                            : null
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );

                          const focusSection = (
                            <div className="flex flex-col gap-2">
                              <div className="px-1">
                                <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                  <Compass
                                    className="h-3.5 w-3.5 text-primary"
                                    strokeWidth={2.75}
                                  />
                                  Your areas
                                </p>
                              </div>
                              {upNextAreas.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
                                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                                    Up next
                                  </span>
                                  {upNextAreas.map(({ item, result }) => {
                                    const category =
                                      categoryMap[item.quest.categoryId];
                                    const label = priorityReasonLabel(result);
                                    return (
                                      <button
                                        key={item.quest.id}
                                        type="button"
                                        onClick={() =>
                                          handleUpNextPress(item.quest)
                                        }
                                        className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm transition-all hover:bg-muted/50 active:scale-95"
                                      >
                                        {category?.shortLabel ||
                                          category?.name ||
                                          'Area'}
                                        {label && (
                                          <span
                                            className={
                                              result.reason === 'almost-there'
                                                ? 'text-lime-600 dark:text-lime-400'
                                                : 'text-amber-600 dark:text-amber-400'
                                            }
                                          >
                                            {label}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {focusEmptyStates}
                              {heroQuest && renderFocusCard(heroQuest)}
                              {areaRows}
                            </div>
                          );

                          const focusContent = chooserMode
                            ? areaChooser
                            : focusSection;
                          const ceremonyActive =
                            areaUnlockCeremony === 'pending' ||
                            areaUnlockCeremony === 'playing';
                          let focusSlot: React.ReactNode;
                          if (!focusUnlocked || ceremonyActive) {
                            focusSlot = (
                              <div className="flex flex-col gap-2 pb-6">
                                <div className="px-1">
                                  <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                    <Compass
                                      className="h-3.5 w-3.5 text-primary"
                                      strokeWidth={2.75}
                                    />
                                    Your areas
                                  </p>
                                </div>
                                <AreaQuestsTeaser
                                  completedSteps={
                                    ceremonyActive
                                      ? FOCUS_UNLOCK_TARGET
                                      : Math.min(
                                          completedEarlyObjectives,
                                          FOCUS_UNLOCK_TARGET,
                                        )
                                  }
                                  targetSteps={FOCUS_UNLOCK_TARGET}
                                  unlocking={areaUnlockCeremony === 'playing'}
                                />
                              </div>
                            );
                          } else if (areaUnlockCeremony === 'done') {
                            focusSlot = (
                              <motion.div
                                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 240,
                                  damping: 24,
                                }}
                              >
                                {focusContent}
                              </motion.div>
                            );
                          } else {
                            focusSlot = focusContent;
                          }

                          return (
                            <>
                              {/* Mobile: onboarding, daily checklist, focus hero + up-next shelf */}
                              <div className="flex flex-col gap-8 md:hidden">
                                {onboardingQuests.length > 0 && (
                                  <div className="space-y-4">
                                    {onboardingQuests.map(renderOnboardingCard)}
                                  </div>
                                )}
                                <div>{dailySection}</div>
                                {!data.dailyQuestsGated && focusSlot}
                              </div>

                              {/* Desktop: left column stacks starter + daily, hero fills
                                  the right column, up-next shelf spans below */}
                              <div className="hidden md:flex md:flex-col md:gap-6">
                                <div className="grid grid-cols-2 items-start gap-4">
                                  <div className="flex flex-col gap-4">
                                    {onboardingQuests.map(renderOnboardingCard)}
                                    {dailySection}
                                  </div>
                                  {!data.dailyQuestsGated && focusSlot}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <QuestSeasonEventOverlay
                season={data?.activeSeason ?? null}
                open={seasonEventOpen}
                rewardCatalog={data?.rewardCatalog ?? {}}
                isPremium={data?.isPremium ?? false}
                claiming={claimingSeason}
                onClose={() => setSeasonEventOpen(false)}
                onClaim={handleClaimSeasonDay}
                onUpgrade={() => openPlus('season_plus_track')}
                paused={false}
              />
              <SwitchFocusConfirm
                open={!!pendingSwitchCategoryId}
                categoryId={pendingSwitchCategoryId ?? undefined}
                categoryName={
                  pendingSwitchCategory?.shortLabel ||
                  pendingSwitchCategory?.name
                }
                coverImageUrl={pendingSwitchCategory?.coverImageUrl}
                currentFocusName={
                  data?.activeFocusCategoryId
                    ? categoryMap[data.activeFocusCategoryId]?.shortLabel ||
                      categoryMap[data.activeFocusCategoryId]?.name
                    : undefined
                }
                switching={
                  !!pendingSwitchCategoryId &&
                  switchingFocusId === pendingSwitchCategoryId
                }
                onConfirm={() => {
                  if (pendingSwitchCategoryId) {
                    void handleSetActiveFocus(pendingSwitchCategoryId);
                  }
                }}
                onUpgrade={() => openPlus('focus_switch')}
                canRent={!data?.isPremium && !data?.rentedFocus}
                onRented={() => {
                  void mutateQuests();
                  setPendingSwitchCategoryId(null);
                }}
                onClose={() => setPendingSwitchCategoryId(null)}
              />
              <PlusUpgradeModal open={plusOpen} placement={plusPlacement} onClose={() => setPlusOpen(false)} />
      </>
    );
  };

  return (
    <>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
        {renderContent()}
      </div>

      <RemoveTagConfirm
        open={!!pendingTagRemoval}
        mode={pendingTagRemoval?.mode}
        categoryName={
          pendingTagRemoval
            ? categoryMap[pendingTagRemoval.categoryId]?.name
            : undefined
        }
        onConfirm={() => pendingTagRemoval?.resolve(true)}
        onClose={() => pendingTagRemoval?.resolve(false)}
      />

      <QuestStartSheet
        open={startQuestCategoryId !== null}
        category={
          startQuestCategoryId ? categoryMap[startQuestCategoryId] ?? null : null
        }
        quest={
          startQuestCategoryId
            ? filteredCategoryQuests.find(
                (quest) => quest.categoryId === startQuestCategoryId,
              ) ?? null
            : null
        }
        rewardCatalog={data?.rewardCatalog ?? {}}
        isPremium={data?.isPremium ?? false}
        onClose={() => setStartQuestCategoryId(null)}
        onDone={refreshQuestData}
      />

      <TagsPopup
        open={editingFocusCategoryId !== null}
        taskId={editingFocusCategoryId}
        onClose={() => setEditingFocusCategoryId(null)}
        title={editingFocusCategory ? `Pick a tag for ${editingFocusCategory.name}` : "Pick a tag"}
        description={data?.isPremium ? 'Tasks with these tags count toward this quest.' : 'Tasks with this tag count toward this quest.'}
        initialTags={editingFocusCategoryId ? (categoryTagMap.get(editingFocusCategoryId) || []) : []}
        maxSelectedTags={data?.isPremium ? undefined : 1}
        currentFocusCategoryId={editingFocusCategoryId ?? undefined}
        tagAssignments={tagAssignments}
        suggestedTagName={editingFocusCategory?.name}
        onSave={handleSaveFocusTags}
      />
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
  const progress = Math.min(season.progressFlies, season.dailyTargetFlies);
  const pct = Math.min(100, (progress / Math.max(1, season.dailyTargetFlies)) * 100);
  const currentReward = season.rewardsByDay.find(
    (entry) => entry.day === season.currentDay,
  );
  const previewReward =
    currentReward?.freeRewards?.[0] ??
    currentReward?.premiumRewards?.[0];
  const claimedToday = season.claimedToday;
  const completedDay = season.claimedTodayDay ?? season.currentDay;
  const completedSeasonDays = new Set(
    season.claimedDays.filter((day) => day >= 1 && day <= season.dayCount),
  );
  const seasonComplete = completedSeasonDays.size >= season.dayCount;
  const nextSeasonDay = Math.min(
    claimedToday ? season.currentDay : season.currentDay + 1,
    season.dayCount,
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
        <div className="absolute inset-x-0 top-24 flex justify-center p-4 md:top-12 lg:top-16 xl:top-20">
          <div className="flex flex-col items-center gap-3 md:gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-base uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.9)] sm:text-lg md:text-xl"
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
              className="max-w-[20rem] text-center text-4xl uppercase leading-none tracking-wide text-white drop-shadow-[0_5px_0_rgba(15,23,42,0.95)] sm:text-5xl md:text-5xl"
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

        <div className="absolute inset-x-3 bottom-10 z-10 mx-auto flex max-w-xl items-center gap-1.5 rounded-[24px] bg-background p-3 shadow-lg sm:gap-3">
          {claimedToday ? (
            <>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                <Check className="h-8 w-8" strokeWidth={4} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black leading-tight text-foreground">
                  {seasonComplete
                    ? 'Season complete!'
                    : `Day ${completedDay} completed`}
                  <br />
                  {seasonComplete
                    ? 'All rewards claimed'
                    : `Return tomorrow for Day ${nextSeasonDay}`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted/60 sm:h-20 sm:w-20">
                {previewReward ? (
                  <SeasonRewardPreview
                    reward={previewReward}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                  />
                ) : (
                  <Gift className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap font-black text-foreground text-[clamp(0.75rem,calc(5vw_-_0.25rem),1.125rem)] sm:whitespace-normal">
                  Unlock Day {season.currentDay}!
                </p>
                <div className="relative mt-2 h-8 overflow-hidden rounded-full bg-muted sm:mt-3">
                  <div className="absolute inset-1">
                    <div
                      className="relative h-full min-w-7 overflow-hidden rounded-full bg-amber-400 transition-all"
                      style={{ width: pct > 0 ? `${pct}%` : '1.75rem' }}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/30 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden"
                      />
                    </div>
                  </div>
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-black tabular-nums text-muted-foreground">
                    {progress} / {season.dailyTargetFlies}
                    <Fly size={26} y={-3} paused={false} interactive={false} />
                  </span>
                </div>
              </div>
            </>
          )}
          <div className="relative flex w-[6.25rem] shrink-0 items-center sm:w-[8.5rem]">
            <button
              type="button"
              onClick={onView}
              className={cn(
                'w-full whitespace-nowrap rounded-2xl px-2.5 pb-3 pt-4 text-xs font-black text-white transition active:translate-y-1 active:shadow-none sm:px-4 sm:text-sm',
                season.claimable
                  ? 'bg-amber-500 shadow-[0_5px_0_#b45309]'
                  : 'bg-lime-600 shadow-[0_5px_0_#3f6212]',
              )}
            >
              {season.claimable ? 'Claim Reward' : 'View Event'}
            </button>
          </div>
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
  className,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, ItemDef>;
  isPremium: boolean;
  paused?: boolean;
  className?: string;
}) {
  const item = reward.itemId ? rewardCatalog[reward.itemId] : null;
  const rarity = item?.rarity ?? (reward.type === 'FLIES' ? 'uncommon' : 'rare');
  const raysClass = GIFT_RARITY_CONFIG[rarity]?.rays ?? GIFT_RARITY_CONFIG.rare.rays;

  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center rounded-2xl bg-card',
        className,
      )}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <SeasonPrizeRays colorClass={raysClass} />
      </div>
      <div
        className="relative z-10 flex items-center justify-center"
        style={{ transform: reward.type === 'FLIES' ? undefined : 'scale(1.6)' }}
      >
        <RewardTile
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
          flySize={48}
          paused={paused}
          hideBadge
          className="rounded-2xl border-0 bg-transparent shadow-none"
        />
      </div>
      <div className="pointer-events-none absolute right-1 top-1 z-20">
        <span className="flex min-w-5 items-center justify-center rounded-md border border-white/10 bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
          {getRewardQuantityLabel(reward, isPremium)}
        </span>
      </div>
    </div>
  );
}

function SeasonPrizeRays({ colorClass }: { colorClass: string }) {
  return (
    <div
      className={cn(
        'absolute inset-[-65%] animate-[spin_18s_linear_infinite] opacity-100',
        colorClass,
      )}
      style={{
        background:
          'repeating-conic-gradient(from 0deg, transparent 0deg 12deg, currentColor 12deg 24deg)',
      }}
      aria-hidden
    />
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
  onClaim: () => void;
  onUpgrade?: () => void;
  paused?: boolean;
}) {
  const timeLeft = useSeasonCountdown(season?.endsAt);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const currentDayRef = useRef<HTMLDivElement | null>(null);
  const futureDayRowRef = useRef<HTMLDivElement | null>(null);
  const [greenLineHeight, setGreenLineHeight] = useState<string>('0px');
  const [greenLineWidth, setGreenLineWidth] = useState<string>('0px');
  const [lockedPreview, setLockedPreview] = useState<{
    day: number;
    rewardType: 'FLIES' | 'ITEM' | 'BOX' | 'BACKGROUND';
    amount?: number;
    itemId?: string;
  } | null>(null);
  const [todayInView, setTodayInView] = useState(true);
  const [introDone, setIntroDone] = useState(false);
  const { indices: wardrobeIndices } = useWardrobeIndices(open && !isPremium);

  // Drag-to-scroll state
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || e.pointerType !== 'mouse') return;
    
    // Only drag if clicking the container or non-interactive parts
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
    const walk = (x - startX.current) * 1.5; // multiplier for speed
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

  const scrollToToday = () => {
    const isHorizontal = window.innerWidth >= 768;
    currentDayRef.current?.scrollIntoView({
      block: isHorizontal ? 'nearest' : 'center',
      inline: isHorizontal ? 'center' : 'nearest',
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    if (!open) return;
    const recompute = () => {
      const container = timelineRef.current;
      const target = currentDayRef.current;
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const isHorizontal = window.innerWidth >= 768; // md breakpoint

      if (isHorizontal) {
        const center = targetRect.left + targetRect.width / 2 - containerRect.left;
        setGreenLineWidth(`${Math.max(0, center)}px`);
        setGreenLineHeight('8px');
      } else {
        const center = targetRect.top + targetRect.height / 2 - containerRect.top;
        setGreenLineHeight(`${Math.max(0, center)}px`);
        setGreenLineWidth('8px'); // fixed width for vertical line
      }
    };
    recompute();
    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener('resize', recompute);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', recompute);
    };
  }, [open, season?.currentDay, season?.dayCount]);

  useEffect(() => {
    if (!open || !season) return;

    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const current = currentDayRef.current;
    const future = futureDayRowRef.current;

    const isHorizontal = window.innerWidth >= 768;

    if (season.currentDay >= season.dayCount) {
      // Last day: just scroll to it smoothly
      setTimeout(() => {
        current?.scrollIntoView({
          block: isHorizontal ? 'nearest' : 'center',
          inline: isHorizontal ? 'center' : 'nearest',
          behavior: 'smooth',
        });
      }, 100);
      return;
    }

    // Immediately jump to the future day row to start the "preview"
    if (future) {
      scrollArea.style.scrollBehavior = 'auto';
      future.scrollIntoView({
        block: isHorizontal ? 'nearest' : 'center',
        inline: isHorizontal ? 'center' : 'nearest',
        behavior: 'auto',
      });
    } else {
      // Fallback to bottom/right if ref isn't ready
      scrollArea.style.scrollBehavior = 'auto';
      if (isHorizontal) {
        scrollArea.scrollLeft = scrollArea.scrollWidth;
      } else {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }

    // Small delay before gliding back to current day
    const timer = setTimeout(() => {
      if (!current) return;
      requestAnimationFrame(() => {
        current.scrollIntoView({
          block: isHorizontal ? 'nearest' : 'center',
          inline: isHorizontal ? 'center' : 'nearest',
          behavior: 'smooth',
        });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [open, season?.currentDay, season?.dayCount]);

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
    const root = scrollAreaRef.current;
    const target = currentDayRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTodayInView(entry.isIntersecting),
      { root, threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, season?.currentDay, season?.dayCount]);

  if (!open || !season || typeof document === 'undefined') return null;

  const progress = Math.min(season.progressFlies, season.dailyTargetFlies);
  const pct = Math.min(100, (progress / Math.max(1, season.dailyTargetFlies)) * 100);
  const endsSoon = new Date(season.endsAt).getTime() - Date.now() < 86_400_000;
  const currentRewards =
    season.rewardsByDay.find((entry) => entry.day === season.currentDay) ??
    null;
  const currentFreeRewards = currentRewards?.freeRewards ?? [];
  const currentPremiumRewards = currentRewards?.premiumRewards ?? [];
  const currentClaimRewards = [
    ...currentFreeRewards,
    ...(isPremium ? currentPremiumRewards : []),
  ];
  const claimedToday = season.claimedToday;
  const completedDay = season.claimedTodayDay ?? season.currentDay;
  const goalReached = season.claimable || claimedToday;
  const completedSeasonDays = new Set(
    season.claimedDays.filter((day) => day >= 1 && day <= season.dayCount),
  );
  const seasonComplete = completedSeasonDays.size >= season.dayCount;
  const nextSeasonDay = Math.min(
    claimedToday ? season.currentDay : season.currentDay + 1,
    season.dayCount,
  );

  // Track which day to start the scroll from (preview point)
  const previewDay = Math.min(season.dayCount, season.currentDay + 10);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col overflow-x-hidden bg-background md:overflow-hidden">
      <div className="relative h-[230px] shrink-0 overflow-hidden md:h-[220px] [@media(max-height:820px)]:md:h-[180px] [@media(max-height:720px)]:md:h-[140px]">
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
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground shadow-sm backdrop-blur-md"
            aria-label="Close season event"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4 md:top-16 [@media(max-height:820px)]:md:top-10 [@media(max-height:720px)]:md:top-6">
            <h2
              className="max-w-[20rem] text-center text-3xl uppercase leading-none tracking-wide text-white drop-shadow-[0_4px_0_rgba(15,23,42,0.95)] sm:text-4xl md:text-4xl md:drop-shadow-[0_5px_0_rgba(15,23,42,0.95)] sm:md:text-5xl [@media(max-height:720px)]:md:text-3xl [@media(max-height:720px)]:md:drop-shadow-[0_3px_0_rgba(15,23,42,0.95)]"
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '3px rgba(15, 23, 42, 0.95)',
                paintOrder: 'stroke fill',
              }}
            >
              {season.name}
            </h2>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 md:bottom-12 [@media(min-width:400px)]:gap-3 [@media(min-width:400px)]:px-5">
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
                <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/60">
                  Ends in
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
                className="group pointer-events-auto relative isolate inline-flex h-12 min-w-0 items-center gap-1.5 rounded-2xl pl-2 pr-2 text-emerald-950 shadow-[0_12px_32px_-6px_rgba(217,119,6,0.55)] ring-2 ring-amber-200/80 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-6px_rgba(217,119,6,0.7)] active:translate-y-0 active:scale-[0.97] [@media(min-width:400px)]:gap-2.5 [@media(min-width:400px)]:pl-3"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                />
                <span
                  aria-hidden
                  className="animate-shimmer absolute inset-0 -z-10 overflow-hidden rounded-2xl bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.7)_50%,transparent_65%)] bg-[length:200%_100%] mix-blend-overlay"
                />
                <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent" />
                <span className="-my-8 -ml-2 -translate-y-2 inline-flex shrink-0">
                  <Icon
                    name="frogPlus"
                    className="h-16 w-16 drop-shadow-[0_4px_0_rgba(31,98,28,0.35)] animate-wiggle [animation-duration:1.6s] [@media(min-width:400px)]:h-20 [@media(min-width:400px)]:w-20"
                  />
                </span>
                <span className="hidden text-[12px] font-black uppercase tracking-[0.14em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] [@media(min-width:360px)]:inline [@media(min-width:400px)]:tracking-[0.22em]">
                  Unlock
                </span>
                <span className="ml-0.5 inline-flex shrink-0 items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Header section - Sticky on mobile, Fixed on web */}
        <div className="sticky top-0 z-50 -mt-6 bg-transparent md:mt-0 md:shrink-0 md:border-b md:border-border/40 md:bg-muted/40 md:backdrop-blur-md">
          <div className="mx-auto w-full max-w-2xl bg-background rounded-t-[32px] md:bg-transparent md:rounded-none">
            <div className="px-4 pb-3 pt-1 md:py-2 md:pb-3 [@media(max-height:820px)]:md:py-1.5 [@media(max-height:820px)]:md:pb-2">
              {goalReached ? (
                <div className="overflow-hidden rounded-[20px] bg-background p-2.5 max-w-md mx-auto md:bg-transparent md:ring-0 md:p-0 md:overflow-visible">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-5 w-5" strokeWidth={4} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black leading-tight text-foreground">
                        {season.currentDay >= season.dayCount && season.claimedToday
                          ? "Season complete!"
                          : season.claimable
                            ? `Day ${season.currentDay} ready!`
                            : `Day ${completedDay} completed`}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-black leading-tight text-muted-foreground">
                        {seasonComplete
                          ? 'All rewards claimed'
                          : season.claimable
                            ? 'Claim to continue'
                            : `Return tomorrow for Day ${nextSeasonDay}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={season.claimable ? onClaim : onClose}
                      disabled={season.claimable && claiming}
                      className="h-10 min-w-[7rem] shrink-0 rounded-xl bg-lime-600 px-6 text-xs font-black text-white shadow-[0_3px_0_#3f6212] transition active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70"
                    >
                      {season.claimable ? (claiming ? 'Claiming...' : 'Claim') : 'Done'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center px-1 py-1.5 max-w-2xl mx-auto md:px-3 md:py-3 md:bg-transparent md:border-0 md:shadow-none md:p-0 md:overflow-visible">
                  <div className="flex w-full max-w-md items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center md:h-10 md:w-10">
                      <Fly size={28} y={-4} paused={paused} interactive={false} />
                    </div>
                    <div className="relative h-7 flex-1 overflow-hidden rounded-full border border-border/60 bg-muted md:h-8">
                      <div className="absolute inset-1">
                        <div
                          className="h-full min-w-6 rounded-full bg-amber-400 transition-all md:min-w-7"
                          style={{ width: pct > 0 ? `${pct}%` : '1.5rem' }}
                        />
                      </div>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums text-muted-foreground md:text-sm">
                        {progress} / {season.dailyTargetFlies}
                      </span>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-black text-primary ring-1 ring-primary/20 md:h-10 md:w-10 md:rounded-2xl md:text-lg">
                      {season.currentDay}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 min-h-0 md:flex md:flex-1 md:min-h-0">
        {/* Fixed sidebar for FREE / PLUS labels on web */}
        <div className="hidden md:flex md:sticky md:top-0 md:left-0 md:w-24 md:shrink-0 md:self-stretch md:flex-col md:items-center md:justify-center md:gap-3 md:bg-background md:border-r md:border-border/40 md:px-2 md:py-6 md:z-20">
          <div className="flex flex-1 w-full items-center justify-center">
            <div className="flex flex-col items-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              <span>Free</span>
            </div>
          </div>
          <div className="h-px w-10 bg-border/60" aria-hidden="true" />
          <div className="flex flex-1 w-full items-center justify-center">
            <button
              type="button"
              onClick={isPremium ? undefined : onUpgrade}
              disabled={isPremium}
              aria-label="Frog Plus"
              className="group relative isolate flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-900 ring-2 ring-amber-200/80 transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-default"
            >
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(150deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
              />
              <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent" />
              <Icon name="frogPlus" className="h-12 w-12 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)]" />
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
          className="relative flex-1 min-h-0 select-none overflow-y-auto md:overflow-x-auto md:overflow-y-hidden no-scrollbar cursor-grab active:cursor-grabbing [touch-action:pan-y] md:[touch-action:pan-x]"
        >
          <div className="mx-auto min-h-full max-w-2xl bg-background md:mx-0 md:h-full md:max-w-none md:min-w-full md:bg-transparent md:px-12 md:pt-0 md:pb-0 md:flex md:flex-col md:justify-center [@media(max-height:820px)]:md:px-8 [@media(max-height:720px)]:md:px-6">
            <div className="relative z-10 mx-auto max-w-2xl bg-background md:mx-0 md:max-w-none md:rounded-t-[48px] md:border-0">

        <div className="px-4 pb-5 pt-5 md:pt-4 [@media(max-width:379px)]:px-2">
          <div className="text-foreground">
            <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:hidden">
              <div className="flex h-10 min-w-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                <span>Free</span>
              </div>
              <div className="w-8 [@media(min-width:400px)]:w-10" />
              <button
                type="button"
                onClick={isPremium ? undefined : onUpgrade}
                disabled={isPremium}
                aria-label="Frog Plus"
                className="group relative isolate flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl pl-2 pr-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-900 ring-2 ring-amber-200/80 transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-default [@media(min-width:400px)]:gap-2 [@media(min-width:400px)]:tracking-[0.18em]"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                />
                <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent" />
                <span className="-my-6 -ml-2 -translate-y-1 inline-flex shrink-0">
                  <Icon name="frogPlus" className="h-12 w-12 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)] [@media(min-width:400px)]:h-16 [@media(min-width:400px)]:w-16" />
                </span>
                <span className="hidden drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] [@media(min-width:360px)]:inline">Frog</span>
                <span className="ml-0.5 inline-flex shrink-0 items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.16em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.22)] ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </button>
            </div>

            <div ref={timelineRef} className="relative mt-4 rounded-[20px] border border-border/40 bg-muted/40 p-3 md:mt-0 md:border-0 md:bg-transparent md:p-0 md:py-12 md:w-fit md:min-w-full [@media(max-width:379px)]:p-1.5 [@media(max-height:820px)]:md:py-8 [@media(max-height:720px)]:md:py-5">
              <div className="absolute bottom-0 left-1/2 top-0 z-0 w-2 -translate-x-1/2 rounded-full bg-border/60 md:left-0 md:right-0 md:top-1/2 md:h-2 md:w-auto md:-translate-y-1/2 md:translate-x-0" />
              <div
                className="absolute left-1/2 top-0 z-0 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_14px_rgba(34,197,94,0.28)] md:left-0 md:top-1/2 md:h-1 md:-translate-y-1/2 md:translate-x-0"
                style={{ height: greenLineHeight, width: greenLineWidth }}
              />

              <div className="relative z-10 flex flex-col gap-y-5 md:flex-row md:gap-x-12 md:gap-y-0 [@media(max-height:820px)]:md:gap-x-8 [@media(max-height:720px)]:md:gap-x-5">
                {season.rewardsByDay.map((entry) => {
                  const isCurrent = entry.day === season.currentDay;
                  const isClaimed = season.claimedDays.includes(entry.day);
                  const freeReward = entry.freeRewards[0];
                  const premiumReward = entry.premiumRewards[0];

                  const isPreviewStart = entry.day === previewDay;

                  return (
                    <div
                      key={entry.day}
                      ref={isPreviewStart ? futureDayRowRef : undefined}
                      className={cn(
                        'relative grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center rounded-3xl px-1 py-2 transition-all duration-300 [@media(max-width:379px)]:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] [@media(max-width:379px)]:px-0.5 md:flex md:flex-col md:w-[180px] md:shrink-0 md:px-0 md:py-4 [@media(max-height:820px)]:md:w-[150px] [@media(max-height:720px)]:md:w-[124px] [@media(max-height:620px)]:md:w-[104px]',
                        isCurrent
                          ? 'bg-primary/5 ring-1 ring-primary/15'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <div className="flex w-full justify-center pr-2 sm:pr-3 md:pr-0 md:pb-8 [@media(max-width:379px)]:pr-1 [@media(max-height:820px)]:md:pb-5 [@media(max-height:720px)]:md:pb-3">
                        <div className="w-full max-w-[170px] md:max-w-none">
                          {freeReward ? (
                            <SingleRewardCard
                              day={entry.day}
                              rewardType={freeReward.type}
                              amount={freeReward.amount}
                              itemId={freeReward.itemId}
                              giftAnimation="box_shake"
                              status={
                                isClaimed
                                  ? 'CLAIMED'
                                  : isCurrent && season.claimable
                                    ? 'READY'
                                    : entry.day < season.currentDay
                                      ? 'MISSED'
                                      : 'LOCKED'
                              }
                              isToday={isCurrent}
                              hideDayLabel
                              hideDropRates
                              forceFullOpacity
                              pausePreview={paused || !isCurrent}
                              onClick={
                                isCurrent && season.claimable && !claimedToday
                                  ? onClaim
                                  : undefined
                              }
                            />
                          ) : (
                            <div className="h-32 w-full rounded-2xl bg-white/5" />
                          )}
                        </div>
                      </div>

                      <div className="relative z-20 flex justify-center md:h-14 md:w-full md:items-center [@media(max-height:820px)]:md:h-10 [@media(max-height:720px)]:md:h-8">
                        {isCurrent && (
                          <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-primary/20 animate-ping-ring md:h-16 md:w-16 [@media(max-width:379px)]:h-12 [@media(max-width:379px)]:w-12 [@media(max-width:379px)]:rounded-[16px] [@media(max-height:820px)]:md:h-12 [@media(max-height:820px)]:md:w-12" />
                        )}
                        <div
                          ref={isCurrent ? currentDayRef : undefined}
                          className={cn(
                            'relative z-10 flex h-12 w-12 flex-col items-center justify-center rounded-[18px] leading-none [@media(max-width:379px)]:h-10 [@media(max-width:379px)]:w-10 [@media(max-width:379px)]:rounded-[14px] [@media(max-height:820px)]:md:h-10 [@media(max-height:820px)]:md:w-10 [@media(max-height:820px)]:md:rounded-[14px] [@media(max-height:720px)]:md:h-8 [@media(max-height:720px)]:md:w-8 [@media(max-height:720px)]:md:rounded-xl',
                            isCurrent
                              ? 'bg-primary text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.18)] ring-2 ring-background'
                              : isClaimed
                                ? 'bg-primary text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.12)] ring-1 ring-primary/20'
                                : 'border-2 border-border bg-background text-muted-foreground shadow-[0_4px_0_rgba(0,0,0,0.06)]',
                          )}
                        >
                          {isClaimed && !isCurrent ? (
                            <Check className="h-5 w-5" strokeWidth={4} />
                          ) : (
                            <>
                              <span className="text-[9px] font-black uppercase tracking-[0.15em] opacity-95 [@media(max-width:379px)]:text-[8px] [@media(max-width:379px)]:tracking-[0.1em] [@media(max-height:720px)]:md:text-[7px]">
                                Day
                              </span>
                              <span className="text-lg font-black tabular-nums [@media(max-width:379px)]:text-base [@media(max-height:820px)]:md:text-base [@media(max-height:720px)]:md:text-sm">
                                {entry.day}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex w-full justify-center pl-2 sm:pl-3 md:pl-0 md:pt-8 [@media(max-width:379px)]:pl-1 [@media(max-height:820px)]:md:pt-5 [@media(max-height:720px)]:md:pt-3">
                        <div
                          className="relative w-full max-w-[170px] md:max-w-none"
                        >
                          {premiumReward ? (
                            <SingleRewardCard
                              day={entry.day}
                              rewardType={premiumReward.type}
                              amount={premiumReward.amount}
                              itemId={premiumReward.itemId}
                              giftAnimation="box_shake"
                              status={
                                !isPremium
                                  ? entry.day < season.currentDay
                                    ? 'MISSED'
                                    : 'LOCKED_PREMIUM'
                                  : isClaimed
                                    ? 'CLAIMED'
                                    : isCurrent && season.claimable
                                      ? 'READY'
                                      : entry.day < season.currentDay
                                        ? 'MISSED'
                                        : 'LOCKED'
                              }
                              isPremiumTier
                              isToday={isCurrent}
                              hideDayLabel
                              hideDropRates
                              forceFullOpacity
                              lockOverlay={!isPremium}
                              pausePreview={paused || !isCurrent}
                              onClick={
                                !isPremium
                                  ? isCurrent &&
                                    season.claimable &&
                                    !claimedToday
                                    ? onUpgrade
                                    : undefined
                                  : isCurrent &&
                                      season.claimable &&
                                      !claimedToday
                                    ? onClaim
                                    : undefined
                              }
                            />
                          ) : (
                            <div className="h-32 w-full rounded-2xl bg-white/5" />
                          )}
                          {!isPremium && premiumReward && (
                            <button
                              type="button"
                              aria-label="Preview Plus reward"
                              onClick={() =>
                                setLockedPreview({
                                  day: entry.day,
                                  rewardType: premiumReward.type,
                                  amount: premiumReward.amount,
                                  itemId: premiumReward.itemId,
                                })
                              }
                              className={cn(
                                'absolute left-0 right-0 top-0 z-30 cursor-pointer rounded-2xl bg-transparent',
                                isCurrent && season.claimable && !claimedToday
                                  ? 'bottom-12'
                                  : 'bottom-0',
                              )}
                            />
                          )}
                        </div>
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
              key="back-to-today"
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
              onClick={scrollToToday}
              className="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-black text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.2),0_12px_28px_-8px_rgba(0,0,0,0.45)] ring-2 ring-background"
            >
              Back to Day {season.currentDay}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      </div>
      <AnimatePresence>
        {lockedPreview && (
          <LockedPlusPreview
            key="locked-plus-preview"
            day={lockedPreview.day}
            rewardType={lockedPreview.rewardType}
            amount={lockedPreview.amount}
            itemId={lockedPreview.itemId}
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
  day,
  rewardType,
  amount,
  itemId,
  rewardCatalog,
  wardrobeIndices,
  onClose,
  onUpgrade,
}: {
  day: number;
  rewardType: 'FLIES' | 'ITEM' | 'BOX' | 'BACKGROUND';
  amount?: number;
  itemId?: string;
  rewardCatalog: Record<string, ItemDef>;
  wardrobeIndices: Partial<Record<string, number>>;
  onClose: () => void;
  onUpgrade?: () => void;
}) {
  const item = itemId ? rewardCatalog[itemId] : undefined;
  const itemName =
    rewardType === 'FLIES'
      ? `${amount ?? 0} Flies`
      : rewardType === 'BOX'
        ? 'Mystery Box'
        : item?.name ?? 'Plus Reward';

  const { frogOnLeft, rotation } = useMemo(() => {
    const tilts = [-9, -6, -4, 4, 6, 9];
    return {
      frogOnLeft: Math.random() < 0.5,
      rotation: tilts[Math.floor(Math.random() * tilts.length)],
    };
  }, []);

  // On desktop (md+) the panel is centered, so sliding by its own height won't
  // clear the screen. Use a viewport-relative offset there so it always slides
  // fully off the bottom on close.
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:px-5"
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.y + info.velocity.y * 0.15 > 130 || info.velocity.y > 800)
            onClose();
        }}
        initial={{ y: offscreen }}
        animate={{ y: 0 }}
        exit={{
          y: offscreen,
          transition: { type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] },
        }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }}
        className="relative w-full rounded-t-3xl bg-background px-5 pb-7 pt-3 shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.35)] md:max-w-md md:rounded-3xl md:px-6 md:pb-7 md:pt-5"
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30 md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mt-2 flex items-center justify-center">
          <div
            className={cn(
              'relative z-10 h-44 w-44 shrink-0 md:h-48 md:w-48',
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
          <div
            className={cn(
              'w-[150px] shrink-0 md:w-[160px]',
              frogOnLeft ? '' : 'order-1',
            )}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <SingleRewardCard
              day={day}
              rewardType={rewardType}
              amount={amount}
              itemId={itemId}
              status="LOCKED_PREMIUM"
              isPremiumTier
              hideDayLabel
              hideDropRates
              forceFullOpacity
              lockOverlay
              giftAnimation="box_shake"
            />
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xl font-black tracking-tight text-foreground">
            {itemName}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Unlock on Day {day} with Plus
          </p>
        </div>

        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            aria-label="Unlock Frog Plus"
            className="group relative isolate mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-4 text-emerald-950 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
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
            <span className="text-sm font-black uppercase tracking-[0.2em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
              Frogress
            </span>
            <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
              Plus
            </span>
          </button>
        )}
      </motion.div>
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
