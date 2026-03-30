'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import { Gift, ScrollText, TimerReset, Trophy, X, Compass, CalendarDays, RefreshCw, Tags } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Fly from './fly';
import TagPopup from './TagPopup';
import type { ItemDef } from '@/lib/skins/catalog';
import type { CategoryQuestProgressView, DailyQuestProgressView, FocusCategoryTagMap, MacroCategoryDefinition, MacroCategoryId, QuestReward } from '@/lib/quests/types';

type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  onboarding: { complete: boolean; selectedCategoryIds: MacroCategoryId[]; categoryTagMap: FocusCategoryTagMap[] };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  categoryQuests: CategoryQuestProgressView[];
  rewardCatalog: Record<string, ItemDef>;
  unlockedAnimationIds: string[];
};

const fetcher = async <T,>(url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed');
  return res.json() as Promise<T>;
};

export function QuestsPopup({ show, onClose, isGuest }: { show: boolean; onClose: () => void; isGuest?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'category'>('category');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [refreshingFocus, setRefreshingFocus] = useState(false);
  const [editingFocusCategoryId, setEditingFocusCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const dragControls = useDragControls();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, error, isLoading, mutate: mutateQuests } = useSWR<QuestsResponse>(
    show && !isGuest ? `/api/quests?timezone=${encodeURIComponent(timezone)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  useEffect(() => {
    setMounted(true);
    const check = () => setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
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

  const categoryMap = useMemo(
    () => Object.fromEntries((data?.macroCategories ?? []).map((entry) => [entry.id, entry])),
    [data?.macroCategories],
  );
  const selectedCategories = useMemo(
    () => (data?.onboarding.selectedCategoryIds ?? []).map((id) => categoryMap[id]).filter(Boolean),
    [categoryMap, data?.onboarding.selectedCategoryIds],
  );
  const categoryTagMap = useMemo(
    () =>
      new Map(
        (data?.onboarding.categoryTagMap ?? []).map((entry) => [
          entry.categoryId,
          entry.tagIds,
        ]),
      ),
    [data?.onboarding.categoryTagMap],
  );
  const claimableDaily = data?.dailyQuests.filter((quest) => quest.claimable).length ?? 0;
  const claimableCategory = data?.categoryQuests.filter((quest) => quest.claimable).length ?? 0;
  const editingFocusCategory = editingFocusCategoryId
    ? categoryMap[editingFocusCategoryId]
    : null;

  const handleClaim = async (claimType: 'daily' | 'category', targetId: string) => {
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
      const bits: string[] = [];
      if (payload.rewardSummary?.fliesGranted) bits.push(`${payload.rewardSummary.fliesGranted} flies`);
      if (payload.rewardSummary?.grantedItemIds?.length) bits.push(`${payload.rewardSummary.grantedItemIds.length} items`);
      setClaimMessage(bits.length ? `Claimed ${bits.join(' + ')}` : 'Reward claimed');
      await mutateQuests();
      mutate('/api/skins/inventory');
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingId(null);
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
      if (!res.ok) throw new Error(payload.error || 'Could not refresh focus quests');
      setClaimMessage('Focus quests refreshed');
      await mutateQuests();
    } catch (err: any) {
      setClaimMessage(err.message || 'Could not refresh focus quests');
    } finally {
      setRefreshingFocus(false);
    }
  };

  const handleSaveFocusTags = async (
    categoryId: string,
    newTags: string[],
  ) => {
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
    setClaimMessage('Focus tags updated');
    await mutateQuests();
  };

  if (!mounted || !show) return null;

  return createPortal(
    <AnimatePresence>
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[1050] bg-background/70 backdrop-blur-md" />
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
            {!isDesktop && <div className="absolute inset-x-0 top-0 z-20 h-8" onPointerDown={(event) => dragControls.start(event)} />}
            <div className="border-b border-border/50 px-4 py-4 md:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ScrollText className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">Quests</h2>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {data && <div className={cn('hidden rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] sm:flex', data.isPremium ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border/50 bg-background/80 text-muted-foreground')}>{data.isPremium ? 'Premium active' : 'Free tier'}</div>}
                  <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {isGuest ? <EmptyState title="Sign in to unlock quests" description="Quests use your tasks, habits, timer sessions, and tags." /> : isLoading ? <LoadingState /> : error || !data ? <EmptyState title="Could not load quests" description="Try reopening the popup." /> : (
                <div className="flex h-full flex-col">
                  <div className="px-4 pt-4 md:px-6">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'daily' | 'category')}>
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
                          {claimableCategory > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{claimableCategory}</span>}
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
                          {claimableDaily > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{claimableDaily}</span>}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {claimMessage && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground">{claimMessage}</div>}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-6">
                    {activeTab === 'category' ? (
                      <div className="space-y-4">
                        {!data.onboarding.complete && <PanelCard>Finish your onboarding on the home page to unlock quests for your focus areas.</PanelCard>}
                        {data.onboarding.complete && selectedCategories.length === 0 && <PanelCard>Select at least one focus area to receive quests here.</PanelCard>}
                        {data.onboarding.complete && selectedCategories.length > 0 && (
                          <div className="rounded-[26px] border border-border/50 bg-card/70 p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-foreground">Focus Tags</p>
                                <p className="text-xs text-muted-foreground">
                                  Link tags to each focus area so category quests can follow them.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleRefreshFocus}
                                disabled={refreshingFocus}
                                className="inline-flex h-9 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={cn(
                                    'h-3.5 w-3.5',
                                    refreshingFocus && 'animate-spin',
                                  )}
                                />
                                {refreshingFocus ? 'Refreshing...' : 'Refresh'}
                              </button>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {selectedCategories.map((category) => {
                                const linkedTagIds = categoryTagMap.get(category.id) ?? [];
                                return (
                                  <div
                                    key={category.id}
                                    className="rounded-[22px] border border-border/50 bg-background/80 p-4"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-black text-foreground">
                                          {category.name}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {linkedTagIds.length > 0
                                            ? `${linkedTagIds.length} linked tag${linkedTagIds.length === 1 ? '' : 's'}`
                                            : 'No linked tags yet'}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setEditingFocusCategoryId(category.id)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 bg-card px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                      >
                                        <Tags className="h-3.5 w-3.5" />
                                        {linkedTagIds.length > 0 ? 'Edit tags' : 'Link tags'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {data.categoryQuests.length === 0 ? <PanelCard>No active focus quests yet.</PanelCard> : data.categoryQuests.map((quest) => <CategoryQuestCard key={quest.id} quest={quest} category={categoryMap[quest.categoryId]} rewardCatalog={data.rewardCatalog} isPremium={data.isPremium} claiming={claimingId === quest.id} onClaim={() => handleClaim('category', quest.id)} />)}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {data.dailyQuests.map((quest) => <DailyQuestCard key={quest.id} quest={quest} rewardCatalog={data.rewardCatalog} isPremium={data.isPremium} claiming={claimingId === quest.id} onClaim={() => handleClaim('daily', quest.id)} />)}
                        </div>
                        <div className="flex justify-center pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleRefreshDaily}
                            disabled={refreshingDaily}
                            className="rounded-2xl font-bold"
                          >
                            {refreshingDaily ? 'Refreshing...' : 'Refresh Daily Quests'}
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
              ? categoryTagMap.get(editingFocusCategoryId) ?? []
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
              ? `Choose the tags that should guide quests for ${editingFocusCategory.name.toLowerCase()}.`
              : 'Choose the tags that should guide quests for this focus area.'
          }
          saveLabel="Save focus tags"
        />
      </>
    </AnimatePresence>,
    document.body,
  );
}

function LoadingState() {
  return <div className="grid gap-4 p-4 md:p-6">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-[26px] border border-border/50 bg-muted/30" />)}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex h-full items-center justify-center p-6"><div className="w-full max-w-md rounded-[28px] border border-border/50 bg-card/90 p-8 text-center shadow-sm"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary"><ScrollText className="h-8 w-8" /></div><h3 className="text-xl font-black text-foreground">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{description}</p></div></div>;
}

function PanelCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[26px] border border-border/50 bg-muted/30 px-5 py-5 text-sm text-muted-foreground">{children}</div>;
}

function DailyQuestCard({ quest, rewardCatalog, isPremium, claiming, onClaim }: { quest: DailyQuestProgressView; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; claiming: boolean; onClaim: () => void }) {
  const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
  return <div className="rounded-[26px] border border-border/50 bg-card/90 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Daily</p><h3 className="mt-1 text-lg font-black leading-tight text-foreground">{quest.title}</h3><p className="mt-1 text-sm text-muted-foreground">{quest.description}</p></div><div className="rounded-2xl border border-border/50 bg-background/80 px-3 py-2 text-center"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Progress</p><p className="mt-1 text-lg font-black text-foreground">{Math.min(quest.progress, quest.target)}/{quest.target}</p></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', quest.claimed ? 'bg-emerald-500' : quest.completed ? 'bg-primary' : 'bg-sky-500')} style={{ width: `${progressPercent}%` }} /></div><div className="mt-4 grid gap-3"><RewardTier rewards={quest.rewards} rewardCatalog={rewardCatalog} isPremium={isPremium} /></div><Button onClick={onClaim} disabled={!quest.claimable || claiming} className="mt-4 h-11 w-full rounded-2xl font-black uppercase tracking-wide">{quest.claimed ? 'Claimed' : claiming ? 'Claiming...' : quest.claimable ? isPremium ? 'Claim Double Reward' : 'Claim Reward' : 'Keep Going'}</Button></div>;
}

function CategoryQuestCard({ quest, category, rewardCatalog, isPremium, claiming, onClaim }: { quest: CategoryQuestProgressView; category?: MacroCategoryDefinition; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; claiming: boolean; onClaim: () => void }) {
  const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border/50 bg-card/95 p-5 shadow-sm">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: category?.accent ?? '#22c55e' }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `radial-gradient(circle at top right, ${category?.accent ?? '#22c55e'}22, transparent 32%)`,
        }}
      />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {quest.coverImageUrl ? (
            <div className="w-full max-w-xs overflow-hidden rounded-[24px] border border-border/50 bg-background/70">
              <img
                src={quest.coverImageUrl}
                alt={quest.title}
                className="h-44 w-full object-cover"
              />
            </div>
          ) : null}

          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                {category?.name ?? 'Category'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                <TimerReset className="h-3.5 w-3.5" />
                {Math.min(quest.progress, quest.target)}/{quest.target}
              </span>
            </div>

            <h3 className="text-3xl font-black tracking-tight text-foreground">
              {quest.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {quest.description}
            </p>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  quest.claimed
                    ? 'bg-emerald-500'
                    : quest.completed
                      ? 'bg-primary'
                      : 'bg-sky-500',
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quest.logic.map((block) => (
                <div
                  key={block.id}
                  className="rounded-[22px] border border-border/50 bg-background/80 p-3"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    {block.type === 'focus_minutes'
                      ? 'Focus Minutes'
                      : block.action === 'add'
                        ? 'Add'
                        : 'Complete'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {block.subject === 'any'
                      ? 'Tasks + Habits'
                      : block.subject === 'habit'
                        ? 'Habits'
                        : 'Tasks'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {block.resolvedTagNames?.length
                      ? `Tags: ${block.resolvedTagNames.join(', ')}`
                      : block.tagMode === 'focus_category_tags'
                        ? 'No linked focus tags yet'
                      : block.resolvedTagName
                        ? `Tag: ${block.resolvedTagName}`
                        : 'All items count'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {Math.min(block.progress, block.target)}/{block.target}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (block.progress / block.target) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full max-w-sm rounded-[24px] border border-border/50 bg-background/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Reward
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {quest.claimed
                    ? 'Claimed'
                    : quest.claimable
                      ? 'Ready to claim'
                      : 'In progress'}
                </p>
              </div>
            </div>

            <RewardTier
              rewards={quest.rewards}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
            />

            <Button
              onClick={onClaim}
              disabled={!quest.claimable || claiming}
              className="mt-4 h-11 w-full rounded-2xl font-black uppercase tracking-wide"
            >
              {quest.claimed
                ? 'Claimed'
                : claiming
                  ? 'Claiming...'
                  : quest.claimable
                    ? isPremium
                      ? 'Claim Double Reward'
                      : 'Claim Reward'
                    : 'Keep Going'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RewardTier({ rewards, rewardCatalog, isPremium }: { rewards: QuestReward[]; rewardCatalog: Record<string, ItemDef>; isPremium: boolean }) {
  return <div className="mt-3 rounded-[20px] border border-border/50 bg-card/80 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Reward</p><span className={cn('text-[10px] font-black uppercase tracking-wide', isPremium ? 'text-primary' : 'text-muted-foreground')}>{isPremium ? 'Premium x2' : 'Base reward'}</span></div><div className="flex flex-wrap gap-2">{rewards.map((reward, index) => <div key={`${reward.type}-${reward.itemId ?? reward.amount ?? index}`} className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-2 text-xs font-bold text-foreground"><RewardIcon reward={reward} /><span>{rewardLabel(reward, rewardCatalog, isPremium)}</span></div>)}</div></div>;
}

function RewardIcon({ reward }: { reward: QuestReward }) {
  if (reward.type === 'FLIES') return <Fly size={16} y={-1} />;
  if (reward.type === 'BOX') return <Gift className="h-4 w-4 text-primary" />;
  return <Trophy className="h-4 w-4 text-primary" />;
}

function rewardLabel(reward: QuestReward, rewardCatalog: Record<string, ItemDef>, isPremium = false) {
  if (reward.type === 'FLIES') return `${(reward.amount ?? 0) * (isPremium ? 2 : 1)} flies`;
  if (reward.itemId) return `${rewardCatalog[reward.itemId]?.name ?? reward.itemId}${isPremium ? ' x2' : ''}`;
  return 'Reward';
}
