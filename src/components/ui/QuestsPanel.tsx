'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import { Check, Clock, Gift, Lock, ScrollText, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import TagsPopup from './TagsPopup';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  CategoryQuestProgressView,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestReward,
} from '@/lib/quests/types';
import {
  CategoryQuestPresentationCard,
  DailyQuestPresentationCard,
  getRewardQuantityLabel,
  RewardTile,
  type QuestTagChip,
} from './QuestCards';
import { RewardCard } from './gift-box/RewardCard';
import { SingleRewardCard } from './daily-reward/RewardCard';
import { RotatingRays } from './gift-box/RotatingRays';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import Fly from './fly';
import { AnimatedNumber } from './AnimatedNumber';
import { mutateInventoryCaches, useInventory } from '@/hooks/useInventory';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { useDraggableScroll } from '@/hooks/useDraggableScroll';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog, { type WardrobeSlot } from './frog';

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  todoCount?: number;
  tags?: Array<{ id: string; name: string; color: string; key?: string }>;
  onboarding: {
    complete: boolean;
    selectedCategoryIds: MacroCategoryId[];
    categoryTagMap: FocusCategoryTagMap[];
  };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  categoryQuests: CategoryQuestProgressView[];
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

type QuestRewardSummary = {
  fliesGranted?: number;
  flyBalanceBefore?: number;
  flyBalanceAfter?: number;
  grantedItemIds?: string[];
};

type QuestRewardRevealEntry = {
  key: string;
  item: ItemDef;
  fliesGranted?: number;
  flyBalanceBefore?: number;
  flyBalanceAfter?: number;
  quantity?: number;
  baseQuantity?: number;
  baseFlies?: number;
  isQuestReward?: boolean;
};

type FlyGainToast = {
  id: number;
  amount: number;
  from: number;
  to: number;
};

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

function createFlyRewardItem(amount: number): ItemDef {
  return {
    id: `flies-${amount}`,
    name: `${amount} Flies`,
    slot: 'hand_item',
    rarity: 'uncommon',
    riveIndex: 0,
    icon: '',
  };
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
  const [claimingSeason, setClaimingSeason] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [editingFocusCategoryId, setEditingFocusCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [rewardRevealQueue, setRewardRevealQueue] = useState<
    QuestRewardRevealEntry[]
  >([]);
  const [openingGiftKey, setOpeningGiftKey] = useState<string | null>(null);
  const [flyGainToast, setFlyGainToast] = useState<FlyGainToast | null>(null);
  const [dailyPage, setDailyPage] = useState(0);
  const [carouselDragging, setCarouselDragging] = useState(false);
  const rewardRevealIdRef = useRef(0);
  const flyGainToastIdRef = useRef(0);
  const knownFlyBalanceRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const initialTopPinnedRef = useRef(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: inventoryData } = useInventory(!isGuest, true);

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
  };

  useEffect(() => {
    const balance = inventoryData?.wardrobe?.flies;
    if (typeof balance === 'number' && Number.isFinite(balance)) {
      knownFlyBalanceRef.current = balance;
    }
  }, [inventoryData?.wardrobe?.flies]);

  useEffect(() => {
    if (!claimMessage) return;
    const timeout = window.setTimeout(() => setClaimMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [claimMessage]);

  useEffect(() => {
    if (!flyGainToast) return;
    const timeout = window.setTimeout(() => setFlyGainToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [flyGainToast]);

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
          entry.tagIds.slice(0, 1),
        ]),
      ),
    [data?.onboarding?.categoryTagMap],
  );
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

  const queueRewardReveal = (summary?: QuestRewardSummary) => {
    const grantedItemIds = Array.isArray(summary?.grantedItemIds)
      ? summary.grantedItemIds
      : [];
    const catalog = data?.rewardCatalog ?? {};
    const nextEntries: QuestRewardRevealEntry[] = [];
    const fliesGranted = Math.max(0, Math.floor(summary?.fliesGranted ?? 0));
    const isPremium = data?.isPremium ?? false;

    if (fliesGranted > 0) {
      const baseFlies = isPremium ? Math.floor(fliesGranted / 2) : fliesGranted;
      const flyBalanceBefore =
        typeof summary?.flyBalanceBefore === 'number'
          ? summary.flyBalanceBefore
          : knownFlyBalanceRef.current;
      const flyBalanceAfter =
        typeof summary?.flyBalanceAfter === 'number'
          ? summary.flyBalanceAfter
          : flyBalanceBefore + fliesGranted;
      knownFlyBalanceRef.current = flyBalanceAfter;
      nextEntries.push({
        key: `flies-${fliesGranted}-${rewardRevealIdRef.current}`,
        item: createFlyRewardItem(fliesGranted),
        fliesGranted,
        flyBalanceBefore,
        flyBalanceAfter,
        baseFlies: isPremium ? baseFlies : undefined,
        isQuestReward: true,
      });
      rewardRevealIdRef.current += 1;
    }

    // Consolidate duplicate item IDs into single entries with quantity
    const itemCounts: Record<string, number> = {};
    for (const itemId of grantedItemIds) {
      itemCounts[itemId] = (itemCounts[itemId] ?? 0) + 1;
    }

    const uniqueItemIds = Object.keys(itemCounts);
    for (const itemId of uniqueItemIds) {
      const item = catalog[itemId];
      if (!item) continue;
      const count = itemCounts[itemId];
      const key = `${item.id}-${rewardRevealIdRef.current}`;
      rewardRevealIdRef.current += 1;
      const baseCount = isPremium ? Math.floor(count / 2) || 1 : count;
      nextEntries.push({
        key,
        item,
        quantity: count > 1 ? count : undefined,
        baseQuantity: isPremium && count > 1 ? baseCount : undefined,
        isQuestReward: true,
      });
    }

    if (!nextEntries.length) return 0;
    setRewardRevealQueue((current) => [...current, ...nextEntries]);
    return nextEntries.length;
  };

  const showFlyGainToast = (entry: QuestRewardRevealEntry) => {
    if (!entry.fliesGranted) return;
    const amount = Math.max(0, Math.floor(entry.fliesGranted));
    if (amount <= 0) return;
    const from =
      typeof entry.flyBalanceBefore === 'number'
        ? entry.flyBalanceBefore
        : Math.max(0, knownFlyBalanceRef.current - amount);
    const to =
      typeof entry.flyBalanceAfter === 'number'
        ? entry.flyBalanceAfter
        : from + amount;

    setFlyGainToast({
      id: ++flyGainToastIdRef.current,
      amount,
      from,
      to,
    });
  };

  const handleRewardRevealClaim = (entry?: QuestRewardRevealEntry) => {
    if (entry?.fliesGranted) {
      showFlyGainToast(entry);
    }
    if (entry?.isQuestReward) {
      mutateInventoryCaches();
    }
    setRewardRevealQueue((current) => current.slice(1));
  };

  const handleRewardRevealOpenGift = async (entry: QuestRewardRevealEntry) => {
    if (entry.item.slot !== 'container') {
      handleRewardRevealClaim(entry);
      return;
    }
    if (openingGiftKey) return;

    const totalToOpen = entry.quantity ?? 1;

    setOpeningGiftKey(entry.key);
    setClaimMessage(null);
    try {
      // Open all copies sequentially, collect prize entries
      const prizeEntries: QuestRewardRevealEntry[] = [];
      for (let i = 0; i < totalToOpen; i++) {
        const res = await fetch('/api/skins/open-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ giftBoxId: entry.item.id }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.prize) {
          throw new Error(payload.error || 'Could not open gift');
        }
        const prize = payload.prize as ItemDef;
        prizeEntries.push({
          key: `${prize.id}-${rewardRevealIdRef.current}`,
          item: prize,
        });
        rewardRevealIdRef.current += 1;
      }

      // Replace current entry with all prize entries (shown one after another)
      setRewardRevealQueue((current) =>
        current[0]?.key === entry.key
          ? [...prizeEntries, ...current.slice(1)]
          : current,
      );
      mutateInventoryCaches();
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not open gift');
    } finally {
      setOpeningGiftKey(null);
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

  const handleSaveFocusTags = async (categoryId: string, newTags: string[]) => {
    if (!data) return;
    const nextTags = newTags.slice(0, 1);

    const nextCategoryTagMap = (data.onboarding.categoryTagMap ?? []).filter(
      (entry) => entry.categoryId !== categoryId,
    );

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
                  <LoadingState />
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
                        data.activeSeason
                          ? 'px-0 pt-0 md:px-0 md:pt-0 md:pb-8'
                          : 'px-4 pt-4 md:px-8 md:pt-8 md:pb-8',
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
                          data.activeSeason && "relative z-10 -mt-8 pt-8 px-4 md:mx-auto md:mt-6 md:w-full md:max-w-6xl md:px-8 md:pt-0 bg-background rounded-t-[24px] md:rounded-none md:bg-transparent"
                        )}>
                        {(() => {
                          const dailyQuests = data.dailyQuests ?? [];
                          const renderDailyCard = (quest: DailyQuestProgressView) => (
                            <DailyQuestPresentationCard
                              key={quest.id}
                              quest={quest}
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              claimingObjectiveId={claimingObjectiveId}
                              onClaimObjective={(objectiveId) =>
                                handleClaimObjective(quest.id, objectiveId)
                              }
                              paused={carouselDragging}
                            />
                          );
                          const renderFocusCard = (quest: CategoryQuestProgressView) => (
                            <CategoryQuestPresentationCard
                              key={quest.id}
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
                              onClaimObjective={(objectiveId) =>
                                handleClaimObjective(quest.id, objectiveId)
                              }
                              paused={carouselDragging}
                            />
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

                          return (
                            <>
                              {/* Mobile: daily carousel then focus stack */}
                              <div className="flex flex-col gap-8 md:hidden">
                                <div className="space-y-4">
                                  {dailyQuests.length === 0 ? (
                                    <PanelCard>No active daily quests here.</PanelCard>
                                  ) : dailyQuests.length === 1 ? (
                                    renderDailyCard(dailyQuests[0])
                                  ) : (
                                    <QuestCarousel
                                      activePage={dailyPage}
                                      onPageChange={setDailyPage}
                                      count={dailyQuests.length}
                                      onDragChange={setCarouselDragging}
                                    >
                                      {dailyQuests.map(renderDailyCard)}
                                    </QuestCarousel>
                                  )}
                                </div>
                                <div className="space-y-4">
                                  {focusEmptyStates}
                                  {filteredCategoryQuests.map(renderFocusCard)}
                                </div>
                              </div>

                              {/* Desktop: masonry-style 2-column layout, daily first */}
                              <div className="hidden md:block md:columns-2 md:gap-4 [column-fill:balance]">
                                {(dailyQuests.length === 0
                                  ? [<PanelCard key="empty-daily">No active daily quests here.</PanelCard>]
                                  : dailyQuests.map(renderDailyCard)
                                ).map((node, i) => (
                                  <div
                                    key={`daily-cell-${i}`}
                                    className="mb-4 break-inside-avoid"
                                  >
                                    {node}
                                  </div>
                                ))}
                                {Array.isArray(focusEmptyStates.props.children) &&
                                  focusEmptyStates.props.children
                                    .filter(Boolean)
                                    .map((child: React.ReactNode, i: number) => (
                                      <div
                                        key={`focus-empty-${i}`}
                                        className="mb-4 break-inside-avoid"
                                      >
                                        {child}
                                      </div>
                                    ))}
                                {filteredCategoryQuests.map((quest) => (
                                  <div
                                    key={`focus-cell-${quest.id}`}
                                    className="mb-4 break-inside-avoid"
                                  >
                                    {renderFocusCard(quest)}
                                  </div>
                                ))}
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
              <QuestRewardRevealOverlay
                queue={rewardRevealQueue}
                openingGiftKey={openingGiftKey}
                isPremium={data?.isPremium ?? false}
                onClaim={handleRewardRevealClaim}
                onOpenGift={handleRewardRevealOpenGift}
                paused={false}
              />
              <FlyGainToastPill toast={flyGainToast} />
              <QuestSeasonEventOverlay
                season={data?.activeSeason ?? null}
                open={seasonEventOpen}
                rewardCatalog={data?.rewardCatalog ?? {}}
                isPremium={data?.isPremium ?? false}
                claiming={claimingSeason}
                onClose={() => setSeasonEventOpen(false)}
                onClaim={handleClaimSeasonDay}
                onUpgrade={() => setPlusOpen(true)}
                paused={false}
              />
              <PlusUpgradeModal open={plusOpen} onClose={() => setPlusOpen(false)} />
      </>
    );
  };

  return (
    <>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
        {renderContent()}
      </div>

      <TagsPopup
        open={editingFocusCategoryId !== null}
        taskId={editingFocusCategoryId}
        onClose={() => setEditingFocusCategoryId(null)}
        title={editingFocusCategory ? `Connect a tag to ${editingFocusCategory.name}` : "Connect a focus tag"}
        description="Choose one tag to decide which tasks count toward this focus area."
        initialTags={editingFocusCategoryId ? (categoryTagMap.get(editingFocusCategoryId) || []) : []}
        maxSelectedTags={1}
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

        <div className="absolute inset-x-3 bottom-10 z-10 mx-auto flex max-w-xl items-center gap-3 rounded-[24px] bg-background p-3 shadow-lg">
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
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-muted/60">
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
                <p className="text-lg font-black text-foreground">
                  Unlock Day {season.currentDay}!
                </p>
                <div className="relative mt-3 h-8 overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-1">
                    <div
                      className="h-full min-w-7 rounded-full bg-amber-400 transition-all"
                      style={{ width: pct > 0 ? `${pct}%` : '1.75rem' }}
                    />
                  </div>
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-black tabular-nums text-muted-foreground">
                    {progress} / {season.dailyTargetFlies}
                    <Fly size={18} y={-3} paused={false} interactive={false} />
                  </span>
                </div>
              </div>
            </>
          )}
          <div className="relative flex w-[8.5rem] shrink-0 items-center">
            <button
              type="button"
              onClick={onView}
              className={cn(
                'w-full rounded-2xl px-4 pb-3 pt-4 text-sm font-black text-white transition active:translate-y-1 active:shadow-none',
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
        'relative flex h-full w-full items-center justify-center rounded-2xl bg-white',
        className,
      )}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <SeasonPrizeRays colorClass={raysClass} />
      </div>
      <div
        className="relative z-10 flex items-center justify-center"
        style={{ transform: 'scale(1.6)' }}
      >
        <RewardTile
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
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
    rewardType: 'FLIES' | 'ITEM' | 'BOX';
    amount?: number;
    itemId?: string;
  } | null>(null);
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
        setGreenLineHeight('4px');
      } else {
        const center = targetRect.top + targetRect.height / 2 - containerRect.top;
        setGreenLineHeight(`${Math.max(0, center)}px`);
        setGreenLineWidth('4px'); // fixed width for vertical line
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

  if (!open || !season || typeof document === 'undefined') return null;

  const progress = Math.min(season.progressFlies, season.dailyTargetFlies);
  const pct = Math.min(100, (progress / Math.max(1, season.dailyTargetFlies)) * 100);
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
    <div className="fixed inset-0 z-[1200] flex flex-col bg-background md:overflow-hidden">
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
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground shadow-sm backdrop-blur-md"
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
          <div className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 md:bottom-12">
            <div className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-black/45 px-2.5 text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <Clock className="h-3.5 w-3.5 text-white/85" strokeWidth={2.6} />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/65">
                Ends in
              </span>
              <span className="text-[12px] font-black leading-none tabular-nums text-white">
                {timeLeft}
              </span>
            </div>
            {!isPremium && onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                aria-label="Unlock Frog Plus"
                className="group pointer-events-auto relative isolate inline-flex h-12 items-center gap-2.5 rounded-2xl pl-3 pr-2 text-emerald-950 shadow-[0_12px_32px_-6px_rgba(217,119,6,0.55)] ring-2 ring-amber-200/80 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-6px_rgba(217,119,6,0.7)] active:translate-y-0 active:scale-[0.97]"
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
                <span className="-my-8 -ml-2 -translate-y-2 inline-flex">
                  <img
                    src="/frogPlus.svg"
                    alt=""
                    className="h-20 w-20 drop-shadow-[0_4px_0_rgba(31,98,28,0.35)] animate-wiggle [animation-duration:1.6s]"
                  />
                </span>
                <span className="text-[12px] font-black uppercase tracking-[0.22em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                  Unlock
                </span>
                <span className="ml-0.5 inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
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
                      className="h-10 shrink-0 rounded-xl bg-lime-600 px-4 text-xs font-black text-white shadow-[0_3px_0_#3f6212] transition active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70"
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
              <img src="/frogPlus.svg" alt="" className="h-12 w-12 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)]" />
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

        <div className="px-4 pb-5 pt-5 md:pt-4">
          <div className="text-foreground">
            <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden">
              <div className="flex h-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                <span>Free</span>
              </div>
              <div className="w-10" />
              <button
                type="button"
                onClick={isPremium ? undefined : onUpgrade}
                disabled={isPremium}
                aria-label="Frog Plus"
                className="group relative isolate flex h-10 items-center justify-center gap-2 rounded-xl pl-2 pr-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-900 ring-2 ring-amber-200/80 transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-default"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                />
                <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent" />
                <span className="-my-6 -ml-2 -translate-y-1 inline-flex">
                  <img src="/frogPlus.svg" alt="" className="h-16 w-16 drop-shadow-[0_2px_0_rgba(31,98,28,0.35)]" />
                </span>
                <span className="drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">Frog</span>
                <span className="ml-0.5 inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.16em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.22)] ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </button>
            </div>

            <div ref={timelineRef} className="relative mt-4 rounded-[20px] border border-border/40 bg-muted/40 p-3 md:mt-0 md:border-0 md:bg-transparent md:p-0 md:py-12 md:w-fit md:min-w-full [@media(max-height:820px)]:md:py-8 [@media(max-height:720px)]:md:py-5">
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
                        'relative grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center rounded-2xl px-1 py-2 transition-all duration-300 md:flex md:flex-col md:w-[180px] md:shrink-0 md:px-0 [@media(max-height:820px)]:md:w-[150px] [@media(max-height:720px)]:md:w-[124px] [@media(max-height:620px)]:md:w-[104px]',
                        !isCurrent && 'hover:bg-muted/30',
                      )}
                    >
                      <div className="flex w-full justify-center pr-2 sm:pr-3 md:pr-0 md:pb-8 [@media(max-height:820px)]:md:pb-5 [@media(max-height:720px)]:md:pb-3">
                        <div className="w-full max-w-[170px] md:max-w-none">
                          {freeReward ? (
                            <SingleRewardCard
                              day={entry.day}
                              rewardType={freeReward.type}
                              amount={freeReward.amount}
                              itemId={freeReward.itemId}
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
                          <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-primary/20 animate-ping-ring md:h-16 md:w-16 [@media(max-height:820px)]:md:h-12 [@media(max-height:820px)]:md:w-12" />
                        )}
                        <div
                          ref={isCurrent ? currentDayRef : undefined}
                          className={cn(
                            'relative z-10 flex h-12 w-12 flex-col items-center justify-center rounded-[18px] leading-none text-primary-foreground shadow-[0_4px_0_rgba(0,0,0,0.12)] ring-1 ring-primary/20 [@media(max-height:820px)]:md:h-10 [@media(max-height:820px)]:md:w-10 [@media(max-height:820px)]:md:rounded-[14px] [@media(max-height:720px)]:md:h-8 [@media(max-height:720px)]:md:w-8 [@media(max-height:720px)]:md:rounded-xl',
                            isClaimed && !isCurrent
                              ? 'bg-primary'
                              : 'bg-primary',
                          )}
                        >
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] opacity-95 [@media(max-height:720px)]:md:text-[7px]">
                            Day
                          </span>
                          <span className="text-lg font-black tabular-nums [@media(max-height:820px)]:md:text-base [@media(max-height:720px)]:md:text-sm">
                            {entry.day}
                          </span>
                        </div>
                      </div>

                      <div className="flex w-full justify-center pl-2 sm:pl-3 md:pl-0 md:pt-8 [@media(max-height:820px)]:md:pt-5 [@media(max-height:720px)]:md:pt-3">
                        <div
                          className="relative w-full max-w-[170px] md:max-w-none"
                        >
                          {premiumReward ? (
                            <SingleRewardCard
                              day={entry.day}
                              rewardType={premiumReward.type}
                              amount={premiumReward.amount}
                              itemId={premiumReward.itemId}
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
  rewardType: 'FLIES' | 'ITEM' | 'BOX';
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

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:px-5"
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.8 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) onClose();
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
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
              indices={wardrobeIndices as Partial<Record<WardrobeSlot, number>>}
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
            <img
              src="/frogPlus.svg"
              alt=""
              className="-my-8 -ml-1 h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)]"
            />
            <span className="text-sm font-black uppercase tracking-[0.2em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
              FrogTask
            </span>
            <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
              Plus
            </span>
          </button>
        )}
      </motion.div>
    </div>
  );
}

function PremiumFlyCounter({
  baseAmount,
  finalAmount,
  paused = false,
}: {
  baseAmount: number;
  finalAmount: number;
  paused?: boolean;
}) {
  const [displayAmount, setDisplayAmount] = useState(baseAmount);
  const [showDouble, setShowDouble] = useState(false);

  useEffect(() => {
    const doubleTimer = setTimeout(() => {
      setShowDouble(true);
      // Animate counting up from base to final
      const duration = 600;
      const steps = 20;
      const increment = (finalAmount - baseAmount) / steps;
      let current = baseAmount;
      let step = 0;
      const interval = setInterval(() => {
        step++;
        current = Math.min(
          baseAmount + Math.round(increment * step),
          finalAmount,
        );
        setDisplayAmount(current);
        if (step >= steps) clearInterval(interval);
      }, duration / steps);
      return () => clearInterval(interval);
    }, 800);
    return () => clearTimeout(doubleTimer);
  }, [baseAmount, finalAmount]);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <Fly size={132} paused={paused} interactive={false} />
      <motion.span
        key={displayAmount}
        animate={showDouble ? { scale: [1.3, 1] } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className="absolute z-40 px-3 py-1 text-sm font-black text-white border shadow-sm right-3 top-3 rounded-xl border-white/20 bg-black/45 backdrop-blur-sm"
      >
        x{displayAmount}
      </motion.span>
    </div>
  );
}

function QuestRewardRevealOverlay({
  queue,
  openingGiftKey,
  isPremium,
  onClaim,
  onOpenGift,
  paused = false,
}: {
  queue: QuestRewardRevealEntry[];
  openingGiftKey: string | null;
  isPremium: boolean;
  onClaim: (entry: QuestRewardRevealEntry) => void;
  onOpenGift: (entry: QuestRewardRevealEntry) => void;
  paused?: boolean;
}) {
  const entry = queue[0] ?? null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {entry && (
        <motion.div
          key={entry.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 flex items-center justify-center"
          >
            <RotatingRays
              colorClass={GIFT_RARITY_CONFIG[entry.item.rarity].rays}
            />
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80" />
          </motion.div>
          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6">
            <RewardCard
              key={entry.key}
              prize={entry.item}
              claiming={openingGiftKey === entry.key}
              onClaim={
                entry.item.slot === 'container'
                  ? () => onOpenGift(entry)
                  : () => onClaim(entry)
              }
              onOpenLater={
                entry.item.slot === 'container' ? () => onClaim(entry) : undefined
              }
              quantity={entry.quantity}
              baseQuantity={entry.baseQuantity}
              isPremium={isPremium && !!entry.isQuestReward}
              showDoubleUpsell={!isPremium && !!entry.isQuestReward}
              paused={paused}
              customPreview={
                entry.fliesGranted ? (
                  entry.baseFlies ? (
                    <PremiumFlyCounter
                      baseAmount={entry.baseFlies}
                      finalAmount={entry.fliesGranted}
                    />
                  ) : (
                    <div className="relative flex items-center justify-center w-full h-full">
                      <Fly size={132} paused={paused} interactive={false} />
                      <span className="absolute z-40 px-3 py-1 text-sm font-black text-white border shadow-sm right-3 top-3 rounded-xl border-white/20 bg-black/45 backdrop-blur-sm">
                        x{entry.fliesGranted}
                      </span>
                    </div>
                  )
                ) : undefined
              }
              slotLabel={entry.fliesGranted ? 'currency' : undefined}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function FlyGainToastPill({ toast }: { toast: FlyGainToast | null }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!toast) return;
    setDisplayValue(toast.from);
    const startTimer = window.setTimeout(() => {
      setDisplayValue(toast.to);
    }, 260);
    return () => window.clearTimeout(startTimer);
  }, [toast]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {toast && (
        <motion.div
          key={toast.id}
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[10000] flex justify-center px-4"
          initial={{ opacity: 0, y: -42, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -34, scale: 0.98 }}
          transition={{
            duration: 0.42,
            ease: [0.32, 0.72, 0, 1],
          }}
        >
          <motion.div
            initial={{ boxShadow: '0 0 0 0 hsl(var(--primary) / 0)' }}
            animate={{
              boxShadow: [
                '0 0 0 0 hsl(var(--primary) / 0)',
                '0 0 0 10px hsl(var(--primary) / 0.18)',
                '0 0 0 0 hsl(var(--primary) / 0)',
              ],
            }}
            transition={{ delay: 0.26, duration: 0.58 }}
            className="flex items-center gap-2 rounded-full border border-primary/25 bg-card/95 py-2 pl-2.5 pr-4 text-foreground shadow-xl shadow-black/15 ring-1 ring-white/25 backdrop-blur-xl"
          >
            <motion.div
              animate={{
                rotate: [0, -12, 13, -7, 0],
                y: [0, -3, 0, -1, 0],
              }}
              transition={{
                delay: 0.22,
                duration: 0.62,
                ease: [0.32, 0.72, 0, 1],
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
            >
              <Fly size={31} y={-4} paused={false} interactive={false} />
            </motion.div>
            <div className="flex items-baseline gap-1.5">
              <span className="rounded-full bg-primary px-2 py-1 text-xs font-black leading-none text-primary-foreground">
                +{toast.amount}
              </span>
              <AnimatedNumber
                value={displayValue}
                className="text-lg font-black tabular-nums leading-none"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 p-4 md:p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-[26px] border border-border/50 bg-muted/30"
        />
      ))}
    </div>
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

function QuestCarousel({
  children,
  activePage,
  onPageChange,
  count,
  onDragChange,
}: {
  children: React.ReactNode;
  activePage: number;
  onPageChange: (page: number) => void;
  count: number;
  onDragChange?: (dragging: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);
  const pages = React.Children.toArray(children);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) return;
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    onDragChange?.(true);
    startX.current = e.clientX;
    lastX.current = e.clientX;
    lastTime.current = Date.now();
    velocity.current = 0;
    scrollStart.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (lastX.current - e.clientX) / dt;
    }
    lastX.current = e.clientX;
    lastTime.current = now;
    const dx = e.clientX - startX.current;
    scrollRef.current.scrollLeft = scrollStart.current - dx;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    isDragging.current = false;
    onDragChange?.(false);
    const el = scrollRef.current;
    el.releasePointerCapture(e.pointerId);
    el.style.cursor = 'grab';

    // Find the nearest card based on drag direction + velocity
    const containerRect = el.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;
    let closestIdx = 0;
    let closestDist = Infinity;

    itemRefs.current.forEach((item, i) => {
      if (!item) return;
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      // Bias toward the direction of the flick
      const dist =
        Math.abs(itemCenter - containerCenter) - velocity.current * 150;
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });

    // Smooth scroll to the target card, then re-enable snap
    el.style.scrollBehavior = 'smooth';
    itemRefs.current[closestIdx]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.style.scrollSnapType = 'x mandatory';
        scrollRef.current.style.scrollBehavior = '';
      }
    }, 350);
  };

  // Track which card is most visible via IntersectionObserver
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    itemRefs.current = itemRefs.current.slice(0, count);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = itemRefs.current.indexOf(
              entry.target as HTMLDivElement,
            );
            if (idx !== -1) onPageChange(idx);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count, onPageChange]);

  return (
    <div>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 cursor-grab select-none md:mx-0 md:grid md:grid-cols-1 md:gap-4 md:overflow-visible md:px-0 md:cursor-auto md:snap-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {pages.map((child, i) => {
          const shouldRender = true;
          return (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="flex-none w-[88%] snap-center md:w-auto"
            >
              {shouldRender ? child : <div className="min-h-[420px]" />}
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-3 md:hidden">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                itemRefs.current[i]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                  inline: 'center',
                });
                onPageChange(i);
              }}
              className={cn(
                'h-2 rounded-full transition-all duration-200',
                i === activePage
                  ? 'bg-primary w-5'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50 w-2',
              )}
            />
          ))}
        </div>
      )}
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
