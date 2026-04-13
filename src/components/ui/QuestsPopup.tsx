'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import { ScrollText, X, Compass, CalendarDays, RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TagPopup from './TagPopup';
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

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  todoCount?: number;
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

type TagsResponse = {
  tags: Array<{ id: string; name: string; color: string; key?: string }>;
  isPremium: boolean;
};

type QuestRewardSummary = {
  fliesGranted?: number;
  grantedItemIds?: string[];
};

type QuestRewardRevealEntry = {
  key: string;
  item: ItemDef;
  fliesGranted?: number;
};

const fetcher = async <T,>(url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed');
  return res.json() as Promise<T>;
};

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
}: {
  show: boolean;
  onClose: () => void;
  isGuest?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'category'>('category');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingObjectiveId, setClaimingObjectiveId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [refreshingFocus, setRefreshingFocus] = useState(false);
  const [editingFocusCategoryId, setEditingFocusCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [rewardRevealQueue, setRewardRevealQueue] = useState<
    QuestRewardRevealEntry[]
  >([]);
  const [openingGiftKey, setOpeningGiftKey] = useState<string | null>(null);
  const rewardRevealIdRef = useRef(0);
  const dragControls = useDragControls();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const {
    data,
    error,
    isLoading,
    mutate: mutateQuests,
  } = useSWR<QuestsResponse>(
    show && !isGuest
      ? `/api/quests?timezone=${encodeURIComponent(timezone)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: tagsData } = useSWR<TagsResponse>(
    show && !isGuest ? '/api/tags' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

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
        (tagsData?.tags ?? []).map((tag, index) => {
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
    [tagsData?.tags],
  );
  const claimableDaily =
    data?.dailyQuests?.filter((quest) => quest.claimable).length ?? 0;
  const claimableCategory =
    data?.categoryQuests?.filter((quest) => quest.claimable).length ?? 0;
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

    if (fliesGranted > 0) {
      nextEntries.push({
        key: `flies-${fliesGranted}-${rewardRevealIdRef.current}`,
        item: createFlyRewardItem(fliesGranted),
        fliesGranted,
      });
      rewardRevealIdRef.current += 1;
    }

    nextEntries.push(
      ...grantedItemIds
        .map((itemId) => catalog[itemId])
        .filter((item): item is ItemDef => Boolean(item))
        .map((item) => {
          const key = `${item.id}-${rewardRevealIdRef.current}`;
          rewardRevealIdRef.current += 1;
          return { key, item };
        }),
    );

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

    setOpeningGiftKey(entry.key);
    setClaimMessage(null);
    try {
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
      const prizeEntry = {
        key: `${prize.id}-${rewardRevealIdRef.current}`,
        item: prize,
      };
      rewardRevealIdRef.current += 1;
      setRewardRevealQueue((current) =>
        current[0]?.key === entry.key
          ? [prizeEntry, ...current.slice(1)]
          : current,
      );
      mutate('/api/skins/inventory');
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
      await mutateQuests();
      mutate('/api/skins/inventory');
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimObjective = async (
    questId: string,
    objectiveId: string,
  ) => {
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
      await mutateQuests();
      mutate('/api/skins/inventory');
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
      await mutateQuests();
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
      await mutateQuests();
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
    await mutateQuests();
  };

  if (!mounted || !show) return null;

  return createPortal(
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[1050] bg-background/70 backdrop-blur-md"
        />
        <div className="pointer-events-none fixed inset-0 z-[1051] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            drag={!isDesktop ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragElastic={{ top: 0, bottom: 0.45 }}
            dragMomentum={false}
            dragSnapToOrigin
            onDragEnd={(_event, { offset, velocity }) => {
              if (offset.y > 120 || velocity.y > 650) onClose();
            }}
            className="pointer-events-auto flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-border/50 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-2xl sm:h-[88vh] sm:max-w-[1080px] sm:rounded-[34px]"
          >
            {!isDesktop && (
              <div
                className="absolute inset-x-0 top-0 z-20 h-8"
                onPointerDown={(event) => dragControls.start(event)}
              />
            )}
            <div className="px-4 py-4 border-b border-border/50 md:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-primary/10 text-primary">
                    <ScrollText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
                      Quests
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {data && (
                    <div
                      className={cn(
                        'hidden rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] sm:flex',
                        data.isPremium
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : 'border-border/50 bg-background/80 text-muted-foreground',
                      )}
                    >
                      {data.isPremium ? 'Premium active' : 'Free tier'}
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-10 h-10 transition-colors border rounded-full border-border/50 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
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
                      <TabsList className="flex h-12 w-full items-center gap-1 rounded-[20px] border border-border/50 bg-card/80 p-1 shadow-sm backdrop-blur-2xl md:h-14">
                        <TabsTrigger
                          value="category"
                          className="
                            flex-1 h-full rounded-2xl relative
                            flex items-center justify-center gap-2
                            text-xs md:text-sm font-bold tracking-wide uppercase
                            transition-all duration-300
                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                          "
                        >
                          <Compass className="w-4 h-4" />
                          <span>My Focus</span>
                          {claimableCategory > 0 && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                              {claimableCategory}
                            </span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger
                          value="daily"
                          className="
                            flex-1 h-full rounded-2xl relative
                            flex items-center justify-center gap-2
                            text-xs md:text-sm font-bold tracking-wide uppercase
                            transition-all duration-300
                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                          "
                        >
                          <CalendarDays className="w-4 h-4" />
                          <span>Daily</span>
                          {claimableDaily > 0 && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                              {claimableDaily}
                            </span>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {claimMessage && (
                      <div className="px-4 py-3 mt-4 text-sm font-medium border rounded-2xl border-primary/20 bg-primary/10 text-foreground">
                        {claimMessage}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 px-4 pt-4 pb-4 overflow-y-auto md:px-6 md:pb-6">
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
                        {(data.categoryQuests?.length ?? 0) === 0 ? (
                          <PanelCard>No active focus quests yet.</PanelCard>
                        ) : (
                          data.categoryQuests!.map((quest) => (
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
                              onClaim={() => handleClaim('category', quest.id)}
                              onClaimObjective={(objectiveId) => handleClaimObjective(quest.id, objectiveId)}
                            />
                          ))
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
                        <div className="space-y-4">
                          {(data.dailyQuests ?? []).map((quest) => (
                            <DailyQuestPresentationCard
                              key={quest.id}
                              quest={quest}
                              rewardCatalog={data.rewardCatalog}
                              isPremium={data.isPremium}
                              claiming={claimingId === quest.id}
                              claimingObjectiveId={claimingObjectiveId}
                              onClaim={() => handleClaim('daily', quest.id)}
                              onClaimObjective={(objectiveId) => handleClaimObjective(quest.id, objectiveId)}
                            />
                          ))}
                        </div>
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
          </motion.div>
        </div>
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
          entry={rewardRevealQueue[0] ?? null}
          openingGiftKey={openingGiftKey}
          onClaim={handleRewardRevealClaim}
          onOpenGift={handleRewardRevealOpenGift}
        />
      </>
    </AnimatePresence>,
    document.body,
  );
}

function QuestRewardRevealOverlay({
  entry,
  openingGiftKey,
  onClaim,
  onOpenGift,
}: {
  entry: QuestRewardRevealEntry | null;
  openingGiftKey: string | null;
  onClaim: () => void;
  onOpenGift: (entry: QuestRewardRevealEntry) => void;
}) {
  return (
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
          <div className="relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6">
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
              customPreview={
                entry.fliesGranted ? (
                  <div className="relative flex h-full w-full items-center justify-center">
                    <Fly size={132} />
                    <span className="absolute right-3 top-3 z-40 rounded-xl border border-white/20 bg-black/45 px-3 py-1 text-sm font-black text-white shadow-sm backdrop-blur-sm">
                      x{entry.fliesGranted}
                    </span>
                  </div>
                ) : undefined
              }
              slotLabel={entry.fliesGranted ? 'currency' : undefined}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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

function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-border/50 bg-muted/30 px-5 py-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
