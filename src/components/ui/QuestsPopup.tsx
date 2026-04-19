'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import {
  ScrollText,
  X,
  Compass,
  CalendarDays,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { BaseSheet } from './BaseSheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TagPopup from './TagPopup';
import { FilterBar, type FilterOption } from './skins/FilterBar';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  CategoryQuestProgressView,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';
import {
  CategoryQuestPresentationCard,
  DailyQuestPresentationCard,
  type QuestTagChip,
} from './QuestCards';
import { RewardCard } from './gift-box/RewardCard';
import { RotatingRays } from './gift-box/RotatingRays';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import Fly from './fly';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { useSheetOverscrollDrag } from './useSheetOverscrollDrag';

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
  rewardCatalog: Record<string, ItemDef>;
  unlockedAnimationIds: string[];
};

type QuestRewardSummary = {
  fliesGranted?: number;
  grantedItemIds?: string[];
};

type QuestRewardRevealEntry = {
  key: string;
  item: ItemDef;
  fliesGranted?: number;
  quantity?: number;
  baseQuantity?: number;
  baseFlies?: number;
  isQuestReward?: boolean;
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

export function QuestsPopup({
  show,
  onClose,
  isGuest,
  onQuestsChanged,
}: {
  show: boolean;
  onClose: () => void;
  isGuest?: boolean;
  onQuestsChanged?: () => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<'daily' | 'category'>('category');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingObjectiveId, setClaimingObjectiveId] = useState<string | null>(
    null,
  );
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [refreshingFocus, setRefreshingFocus] = useState(false);
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string>('all');
  const [editingFocusCategoryId, setEditingFocusCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [rewardRevealQueue, setRewardRevealQueue] = useState<
    QuestRewardRevealEntry[]
  >([]);
  const [openingGiftKey, setOpeningGiftKey] = useState<string | null>(null);
  const [categoryPage, setCategoryPage] = useState(0);
  const [dailyPage, setDailyPage] = useState(0);
  const rewardRevealIdRef = useRef(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const overscrollDrag = useSheetOverscrollDrag();

  const {
    data,
    error,
    isLoading,
    mutate: mutateQuests,
  } = useSWR<QuestsResponse>(
    !isGuest && show ? getQuestsUrl(timezone) : null,
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
    if (!claimMessage) return;
    const timeout = window.setTimeout(() => setClaimMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [claimMessage]);

  useEffect(() => {
    if (show) return;
    setRewardRevealQueue([]);
    setOpeningGiftKey(null);
  }, [show]);

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
  // Count only claimable rewards (completed objectives with unclaimed rewards + claimable quests)
  const countDaily = useMemo(() => {
    return (data?.dailyQuests ?? []).reduce((sum, quest) => {
      if (quest.claimed) return sum;
      let count = 0;
      // Count quest itself if claimable
      if (quest.claimable) count++;
      // Count completed objectives with unclaimed rewards
      quest.logic.forEach((block) => {
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          count++;
        }
      });
      return sum + count;
    }, 0);
  }, [data?.dailyQuests]);

  const countCategory = useMemo(() => {
    return (data?.categoryQuests ?? []).reduce((sum, quest) => {
      if (quest.claimed) return sum;
      let count = 0;
      if (quest.claimable) count++;
      quest.logic.forEach((block) => {
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          count++;
        }
      });
      return sum + count;
    }, 0);
  }, [data?.categoryQuests]);

  // Count active (in-progress, not yet claimable) quests as fallback
  const activeDailyCount = useMemo(() => {
    return (data?.dailyQuests ?? []).filter((q) => !q.claimed && !q.claimable)
      .length;
  }, [data?.dailyQuests]);

  const activeCategoryCount = useMemo(() => {
    return (data?.categoryQuests ?? []).filter(
      (q) => !q.claimed && !q.claimable,
    ).length;
  }, [data?.categoryQuests]);

  const subCategoryOptions: FilterOption[] = useMemo(() => {
    const options: FilterOption[] = [
      { id: 'all', label: 'All', icon: <Sparkles className="w-4 h-4" /> },
    ];
    if (data?.macroCategories) {
      data.macroCategories.forEach((cat) => {
        options.push({
          id: cat.id,
          label: cat.shortLabel || cat.name,
          icon: <Compass className="w-4 h-4" />,
        });
      });
    }
    return options;
  }, [data?.macroCategories]);

  const categoryBadges = useMemo(() => {
    const badges: Record<string, number> = {};
    if (!data?.categoryQuests) return badges;

    // per category badge — only claimable rewards
    data.categoryQuests.forEach((quest) => {
      if (!quest.categoryId || quest.claimed) return;
      let count = 0;
      if (quest.claimable) count++;
      quest.logic.forEach((block) => {
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          count++;
        }
      });
      if (count > 0) {
        badges[quest.categoryId] = (badges[quest.categoryId] ?? 0) + count;
      }
    });

    return badges;
  }, [data?.categoryQuests, countCategory]);

  const activeCategoryBadges = useMemo(() => {
    const badges: Record<string, number> = {};
    if (!data?.categoryQuests) return badges;

    data.categoryQuests.forEach((quest) => {
      if (!quest.categoryId || quest.claimed || quest.claimable) return;
      badges[quest.categoryId] = (badges[quest.categoryId] ?? 0) + 1;
    });

    return badges;
  }, [data?.categoryQuests, activeCategoryCount]);

  const filteredCategoryQuests = useMemo(() => {
    if (!data?.categoryQuests) return [];
    if (activeSubCategoryId === 'all') return data.categoryQuests;
    return data.categoryQuests.filter(
      (q) => q.categoryId === activeSubCategoryId,
    );
  }, [data?.categoryQuests, activeSubCategoryId]);

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
      nextEntries.push({
        key: `flies-${fliesGranted}-${rewardRevealIdRef.current}`,
        item: createFlyRewardItem(fliesGranted),
        fliesGranted,
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

  const handleRewardRevealClaim = () => {
    setRewardRevealQueue((current) => current.slice(1));
  };

  const handleRewardRevealOpenGift = async (entry: QuestRewardRevealEntry) => {
    if (entry.item.slot !== 'container') {
      handleRewardRevealClaim();
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

  const handleClaim = async (
    claimType: 'daily' | 'category',
    targetId: string,
  ) => {
    if (claimingId) return;
    setClaimingId(targetId);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimType, targetId, timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      const revealedCount = queueRewardReveal(payload.rewardSummary);
      if (revealedCount === 0) {
        const bits: string[] = [];
        if (payload.rewardSummary?.fliesGranted)
          bits.push(`${payload.rewardSummary.fliesGranted} flies`);
        if (payload.rewardSummary?.grantedItemIds?.length)
          bits.push(`${payload.rewardSummary.grantedItemIds.length} items`);
        setClaimMessage(
          bits.length ? `Claimed ${bits.join(' + ')}` : 'Reward claimed',
        );
      }
      await refreshQuestData();
      mutateInventoryCaches();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingId(null);
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
      mutateInventoryCaches();
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingObjectiveId(null);
    }
  };

  const handleRefreshDaily = async () => {
    if (refreshingDaily) return;
    setRefreshingDaily(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not refresh quests');
      setClaimMessage('Daily quests refreshed');
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not refresh quests');
    } finally {
      setRefreshingDaily(false);
    }
  };

  const handleRefreshFocus = async () => {
    if (refreshingFocus) return;
    setRefreshingFocus(true);
    setClaimMessage(null);
    try {
      const res = await fetch('/api/quests/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, scope: 'focus' }),
      });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload.error || 'Could not refresh focus quests');
      setClaimMessage('Focus quests refreshed');
      await refreshQuestData();
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not refresh focus quests');
    } finally {
      setRefreshingFocus(false);
    }
  };

  const handleSaveFocusTags = async (categoryId: string, newTags: string[]) => {
    if (!data) return;

    const nextCategoryTagMap = (data.onboarding.categoryTagMap ?? []).filter(
      (entry) => entry.categoryId !== categoryId,
    );

    if (newTags.length > 0) {
      nextCategoryTagMap.push({
        categoryId: categoryId as MacroCategoryId,
        tagIds: newTags,
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

  return (
    <>
      <BaseSheet
        open={show}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        className="h-[92vh] sm:h-[88vh] sm:max-w-[1080px]"
        zIndex={1050}
      >
        {({ isDesktop, dragControls }) => {
          overscrollDrag.setContext(dragControls, !isDesktop);

          return (
            <>
              <div
                onPointerDown={(e) => !isDesktop && dragControls.start(e)}
                className="px-4 py-4 border-b border-border/50 md:px-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 shrink-0">
                      <ScrollText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black tracking-tight text-foreground uppercase leading-none">
                        Quests
                      </h2>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5 opacity-70">
                        Track your progress
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onClose}
                      className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95"
                    >
                      <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {isGuest ? (
                  <EmptyState
                    title="Sign in to unlock quests"
                    description="Quests use your tasks, habits, timer sessions, and tags."
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
                    <div className="px-4 pt-4 md:px-6">
                      <Tabs
                        value={activeTab}
                        onValueChange={(value) =>
                          setActiveTab(value as 'daily' | 'category')
                        }
                      >
                        <TabsList className="flex items-center w-full h-12 gap-2 p-1 border rounded-full shadow-sm border-border/50 bg-background/50 backdrop-blur-2xl md:h-14">
                          <TabsTrigger
                            value="category"
                            className="
                              flex-1 h-full rounded-full relative
                              flex items-center justify-center gap-1.5
                              text-[11px] md:text-sm font-black tracking-widest uppercase
                              transition-all duration-300
                              data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-primary/20 data-[state=active]:ring-1 data-[state=active]:ring-primary/20
                              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                            "
                          >
                            <Compass className="w-4 h-4" />
                            <span>My Focus</span>
                            {countCategory > 0 ? (
                              <span className="flex h-5 min-w-5 px-0.5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm -ml-0.5 leading-none tracking-normal animate-in zoom-in">
                                {countCategory}
                              </span>
                            ) : activeCategoryCount > 0 ? (
                              <span className="flex h-5 min-w-5 px-0.5 items-center justify-center rounded-full bg-muted-foreground/50 text-[10px] font-bold text-white shadow-sm -ml-0.5 leading-none tracking-normal">
                                {activeCategoryCount}
                              </span>
                            ) : null}
                          </TabsTrigger>
                          <TabsTrigger
                            value="daily"
                            className="
                              flex-1 h-full rounded-full relative
                              flex items-center justify-center gap-1.5
                              text-[11px] md:text-sm font-black tracking-widest uppercase
                              transition-all duration-300
                              data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-primary/20 data-[state=active]:ring-1 data-[state=active]:ring-primary/20
                              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                            "
                          >
                            <CalendarDays className="w-4 h-4" />
                            <span>Daily</span>
                            {countDaily > 0 ? (
                              <span className="flex h-5 min-w-5 px-0.5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm -ml-0.5 leading-none tracking-normal animate-in zoom-in">
                                {countDaily}
                              </span>
                            ) : activeDailyCount > 0 ? (
                              <span className="flex h-5 min-w-5 px-0.5 items-center justify-center rounded-full bg-muted-foreground/50 text-[10px] font-bold text-white shadow-sm -ml-0.5 leading-none tracking-normal">
                                {activeDailyCount}
                              </span>
                            ) : null}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {claimMessage && (
                        <div className="px-4 py-3 mt-4 text-sm font-medium border rounded-2xl border-primary/20 bg-primary/10 text-foreground">
                          {claimMessage}
                        </div>
                      )}
                    </div>
                    <div
                      ref={overscrollDrag.bind}
                      className="flex-1 min-h-0 px-4 pt-4 pb-4 overflow-y-auto md:px-6 md:pb-6 overscroll-none"
                    >
                      {activeTab === 'category' ? (
                        <div className="space-y-4">
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
                          {data.onboarding?.complete && (
                            <FilterBar
                              active={activeSubCategoryId}
                              onChange={(id: string) => {
                                setActiveSubCategoryId(id);
                                setCategoryPage(0);
                              }}
                              options={subCategoryOptions}
                              badges={categoryBadges}
                              badgeClassName="text-white bg-amber-500"
                              fallbackBadges={activeCategoryBadges}
                              fallbackBadgeClassName="text-white bg-muted-foreground/50"
                            />
                          )}
                          {filteredCategoryQuests.length === 0 ? (
                            <PanelCard>No active focus quests here.</PanelCard>
                          ) : filteredCategoryQuests.length === 1 ? (
                            <CategoryQuestPresentationCard
                              quest={filteredCategoryQuests[0]}
                              category={
                                categoryMap[
                                  filteredCategoryQuests[0].categoryId
                                ]
                              }
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              claiming={
                                claimingId === filteredCategoryQuests[0].id
                              }
                              claimingObjectiveId={claimingObjectiveId}
                              linkedTags={
                                (
                                  categoryTagMap.get(
                                    filteredCategoryQuests[0].categoryId,
                                  ) ?? []
                                )
                                  .map((tagId) => tagCatalog.get(tagId))
                                  .filter(Boolean) as QuestTagChip[]
                              }
                              onEditTags={() =>
                                setEditingFocusCategoryId(
                                  filteredCategoryQuests[0].categoryId,
                                )
                              }
                              onClaim={() =>
                                handleClaim(
                                  'category',
                                  filteredCategoryQuests[0].id,
                                )
                              }
                              onClaimObjective={(objectiveId) =>
                                handleClaimObjective(
                                  filteredCategoryQuests[0].id,
                                  objectiveId,
                                )
                              }
                            />
                          ) : (
                            <QuestCarousel
                              activePage={categoryPage}
                              onPageChange={setCategoryPage}
                              count={filteredCategoryQuests.length}
                            >
                              {filteredCategoryQuests.map((quest) => (
                                <CategoryQuestPresentationCard
                                  key={quest.id}
                                  quest={quest}
                                  category={categoryMap[quest.categoryId]}
                                  rewardCatalog={data.rewardCatalog}
                                  isPremium={data.isPremium}
                                  claiming={claimingId === quest.id}
                                  claimingObjectiveId={claimingObjectiveId}
                                  linkedTags={
                                    (categoryTagMap.get(quest.categoryId) ?? [])
                                      .map((tagId) => tagCatalog.get(tagId))
                                      .filter(Boolean) as QuestTagChip[]
                                  }
                                  onEditTags={() =>
                                    setEditingFocusCategoryId(quest.categoryId)
                                  }
                                  onClaim={() =>
                                    handleClaim('category', quest.id)
                                  }
                                  onClaimObjective={(objectiveId) =>
                                    handleClaimObjective(quest.id, objectiveId)
                                  }
                                />
                              ))}
                            </QuestCarousel>
                          )}
                          {data.onboarding?.complete &&
                            selectedCategories.length > 0 && (
                              <div className="flex justify-center pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleRefreshFocus}
                                  disabled={refreshingFocus}
                                  className="font-bold rounded-2xl"
                                >
                                  <RefreshCw
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      refreshingFocus && 'animate-spin',
                                    )}
                                  />
                                  {refreshingFocus
                                    ? 'Refreshing...'
                                    : 'Refresh My Focus'}
                                </Button>
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {(() => {
                            const dailyQuests = data.dailyQuests ?? [];
                            if (dailyQuests.length === 0) return null;
                            if (dailyQuests.length === 1) {
                              const quest = dailyQuests[0];
                              return (
                                <DailyQuestPresentationCard
                                  quest={quest}
                                  rewardCatalog={data.rewardCatalog}
                                  isPremium={data.isPremium}
                                  claiming={claimingId === quest.id}
                                  claimingObjectiveId={claimingObjectiveId}
                                  onClaim={() => handleClaim('daily', quest.id)}
                                  onClaimObjective={(objectiveId) =>
                                    handleClaimObjective(quest.id, objectiveId)
                                  }
                                />
                              );
                            }
                            return (
                              <QuestCarousel
                                activePage={dailyPage}
                                onPageChange={setDailyPage}
                                count={dailyQuests.length}
                              >
                                {dailyQuests.map((quest) => (
                                  <DailyQuestPresentationCard
                                    key={quest.id}
                                    quest={quest}
                                    rewardCatalog={data.rewardCatalog}
                                    isPremium={data.isPremium}
                                    claiming={claimingId === quest.id}
                                    claimingObjectiveId={claimingObjectiveId}
                                    onClaim={() =>
                                      handleClaim('daily', quest.id)
                                    }
                                    onClaimObjective={(objectiveId) =>
                                      handleClaimObjective(
                                        quest.id,
                                        objectiveId,
                                      )
                                    }
                                  />
                                ))}
                              </QuestCarousel>
                            );
                          })()}
                          <div className="flex justify-center pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRefreshDaily}
                              disabled={refreshingDaily}
                              className="font-bold rounded-2xl"
                            >
                              {refreshingDaily
                                ? 'Refreshing...'
                                : 'Refresh Daily Quests'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </BaseSheet>
      <TagPopup
        open={!!editingFocusCategoryId}
        onClose={() => setEditingFocusCategoryId(null)}
        taskId={editingFocusCategoryId}
        initialTags={
          editingFocusCategoryId
            ? (categoryTagMap.get(editingFocusCategoryId) ?? [])
            : []
        }
        onSave={handleSaveFocusTags}
        eyebrow="My Focus"
        title={
          editingFocusCategory
            ? `${editingFocusCategory.name} Tags`
            : 'Focus Tags'
        }
        description={
          editingFocusCategory
            ? `Choose which tags should count toward your ${editingFocusCategory.name.toLowerCase()} quests.`
            : 'Choose the tags that should guide quests for this focus area.'
        }
        saveLabel="Save focus tags"
      />
      <QuestRewardRevealOverlay
        queue={rewardRevealQueue}
        openingGiftKey={openingGiftKey}
        isPremium={data?.isPremium ?? false}
        onClaim={handleRewardRevealClaim}
        onOpenGift={handleRewardRevealOpenGift}
      />
    </>
  );
}

function PremiumFlyCounter({
  baseAmount,
  finalAmount,
}: {
  baseAmount: number;
  finalAmount: number;
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
      <Fly size={132} />
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
}: {
  queue: QuestRewardRevealEntry[];
  openingGiftKey: string | null;
  isPremium: boolean;
  onClaim: () => void;
  onOpenGift: (entry: QuestRewardRevealEntry) => void;
}) {
  const entry = queue[0] ?? null;
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
                  : onClaim
              }
              onOpenLater={
                entry.item.slot === 'container' ? onClaim : undefined
              }
              quantity={entry.quantity}
              baseQuantity={entry.baseQuantity}
              isPremium={isPremium && !!entry.isQuestReward}
              showDoubleUpsell={!isPremium && !!entry.isQuestReward}
              customPreview={
                entry.fliesGranted ? (
                  entry.baseFlies ? (
                    <PremiumFlyCounter
                      baseAmount={entry.baseFlies}
                      finalAmount={entry.fliesGranted}
                    />
                  ) : (
                    <div className="relative flex items-center justify-center w-full h-full">
                      <Fly size={132} />
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
}: {
  children: React.ReactNode;
  activePage: number;
  onPageChange: (page: number) => void;
  count: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // let touch use native scroll
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
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
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 cursor-grab select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {React.Children.map(children, (child, i) => (
          <div
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="flex-none w-[88%] snap-center"
          >
            {child}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-3">
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
