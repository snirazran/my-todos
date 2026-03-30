'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import { Gift, ScrollText, Trophy, X, Compass, CalendarDays, RefreshCw, Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Fly from './fly';
import Frog from './frog';
import TagPopup from './TagPopup';
import { GiftRive } from './gift-box/GiftBox';
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

type TagsResponse = {
  tags: Array<{ id: string; name: string; color: string; key?: string }>;
  isPremium: boolean;
};

type QuestTagChip = {
  id: string;
  name: string;
  color: string;
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
  const { data: tagsData } = useSWR<TagsResponse>(
    show && !isGuest ? '/api/tags' : null,
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

  useEffect(() => {
    if (!claimMessage) return;
    const timeout = window.setTimeout(() => setClaimMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [claimMessage]);

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
  const tagCatalog = useMemo(
    () =>
      new Map(
        (tagsData?.tags ?? [])
          .map((tag, index) => {
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
                        {data.categoryQuests.length === 0 ? <PanelCard>No active focus quests yet.</PanelCard> : data.categoryQuests.map((quest) => (
                          <CategoryQuestCard
                            key={quest.id}
                            quest={quest}
                            category={categoryMap[quest.categoryId]}
                            rewardCatalog={data.rewardCatalog}
                            isPremium={data.isPremium}
                            claiming={claimingId === quest.id}
                            linkedTags={(categoryTagMap.get(quest.categoryId) ?? []).map((tagId) => tagCatalog.get(tagId)).filter(Boolean) as QuestTagChip[]}
                            onEditTags={() => setEditingFocusCategoryId(quest.categoryId)}
                            onClaim={() => handleClaim('category', quest.id)}
                          />
                        ))}
                        {data.onboarding.complete && selectedCategories.length > 0 && (
                          <div className="flex justify-center pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRefreshFocus}
                              disabled={refreshingFocus}
                              className="rounded-2xl font-bold"
                            >
                              <RefreshCw
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  refreshingFocus && 'animate-spin',
                                )}
                              />
                              {refreshingFocus ? 'Refreshing...' : 'Refresh My Focus'}
                            </Button>
                          </div>
                        )}
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
              ? `Choose which tags should count toward your ${editingFocusCategory.name.toLowerCase()} quests.`
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

function QuestTagPill({ tag }: { tag: QuestTagChip }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
      style={{
        backgroundColor: `${tag.color}18`,
        borderColor: `${tag.color}4d`,
        color: tag.color,
      }}
    >
      {tag.name}
    </span>
  );
}

function formatQuestObjective(block: CategoryQuestProgressView['logic'][number]) {
  const target = Math.max(0, block.target ?? 0);

  if (block.type === 'focus_minutes') {
    if (block.subject === 'habit') return `Focus for ${target} minutes on habits`;
    if (block.subject === 'task') return `Focus for ${target} minutes on tasks`;
    return `Focus for ${target} minutes`;
  }

  const subjectLabel =
    block.subject === 'any'
      ? 'items'
      : block.subject === 'habit'
        ? target === 1
          ? 'habit'
          : 'habits'
        : target === 1
          ? 'task'
          : 'tasks';

  const actionLabel = block.action === 'add' ? 'Add' : 'Complete';
  return `${actionLabel} ${target} ${subjectLabel}`;
}

function DailyQuestCard({ quest, rewardCatalog, isPremium, claiming, onClaim }: { quest: DailyQuestProgressView; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; claiming: boolean; onClaim: () => void }) {
  const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
  return <div className="rounded-[26px] border border-border/50 bg-card/90 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Daily</p><h3 className="mt-1 text-lg font-black leading-tight text-foreground">{quest.title}</h3><p className="mt-1 text-sm text-muted-foreground">{quest.description}</p></div><div className="rounded-2xl border border-border/50 bg-background/80 px-3 py-2 text-center"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Progress</p><p className="mt-1 text-lg font-black text-foreground">{Math.min(quest.progress, quest.target)}/{quest.target}</p></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', quest.claimed ? 'bg-emerald-500' : quest.completed ? 'bg-primary' : 'bg-sky-500')} style={{ width: `${progressPercent}%` }} /></div><div className="mt-4 grid gap-3"><RewardTier rewards={quest.rewards} rewardCatalog={rewardCatalog} isPremium={isPremium} /></div><Button onClick={onClaim} disabled={!quest.claimable || claiming} className="mt-4 h-11 w-full rounded-2xl font-black uppercase tracking-wide">{quest.claimed ? 'Claimed' : claiming ? 'Claiming...' : quest.claimable ? isPremium ? 'Claim Double Reward' : 'Claim Reward' : 'Keep Going'}</Button></div>;
}

function CategoryQuestCard({ quest, category, rewardCatalog, isPremium, claiming, linkedTags, onEditTags, onClaim }: { quest: CategoryQuestProgressView; category?: MacroCategoryDefinition; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; claiming: boolean; linkedTags: QuestTagChip[]; onEditTags: () => void; onClaim: () => void }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
      <div className="relative min-h-[310px] overflow-hidden">
          {quest.coverImageUrl ? (
            <img
              src={quest.coverImageUrl}
              alt={quest.title}
              className="h-[250px] w-full object-cover sm:h-[285px]"
            />
          ) : (
              <div
                className="h-[250px] w-full sm:h-[285px]"
                style={{
                  background: `linear-gradient(135deg, ${category?.backgroundFrom ?? '#0f172a'}, ${category?.backgroundTo ?? '#1e293b'})`,
                }}
              />
            )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/28 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start gap-3 p-4">
            <div className="flex items-start gap-2">
              <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">
                {category?.shortLabel ?? category?.name ?? 'Focus'}
              </span>
            </div>
          </div>
        <div className="absolute bottom-4 right-4 z-10 flex flex-wrap justify-end gap-2 sm:bottom-5 sm:right-5">
              {quest.rewards.map((reward, index) => (
                <RewardTile
                  key={`${reward.type}-${reward.itemId ?? reward.amount ?? index}`}
                  reward={reward}
                  rewardCatalog={rewardCatalog}
                  isPremium={isPremium}
                  compact
                />
              ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 pr-[116px] sm:p-5 sm:pr-[132px]">
          <h3 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)] sm:text-4xl">
            {quest.title}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] sm:text-base">
            {quest.description}
          </p>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <div className="space-y-3">
            {quest.logic.map((block) => (
            <div key={block.id} className="border-t border-border/40 pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-3 sm:items-end">
                  <div>
                    <p className="text-xl font-black leading-tight text-foreground">
                      {formatQuestObjective(block)}
                    </p>
                  </div>
                  <div className="rounded-full border border-border/50 bg-background/80 px-3 py-1 text-sm font-black text-foreground">
                    {Math.min(block.progress, block.target)}/{block.target}
                  </div>
                </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {block.tagMode === 'focus_category_tags' ? (
                  <>
                    {linkedTags.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={onEditTags}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-background/80 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          aria-label="Edit linked tags"
                          title="Edit linked tags"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        {linkedTags.map((tag) => (
                          <QuestTagPill key={`${block.id}-${tag.id}`} tag={tag} />
                        ))}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={onEditTags}
                        className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary transition hover:bg-primary/15"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Select a tag to start
                      </button>
                    )}
                  </>
                ) : block.resolvedTagNames?.length ? (
                  block.resolvedTagNames.map((tagName, index) => {
                    const matchedTag = linkedTags.find(
                      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
                    );
                    return (
                      <QuestTagPill
                        key={`${block.id}-${matchedTag?.id ?? tagName}-${index}`}
                        tag={
                          matchedTag ?? {
                            id: `${block.id}-${tagName}-${index}`,
                            name: tagName,
                            color: category?.accent ?? '#22c55e',
                          }
                        }
                      />
                    );
                  })
                ) : block.resolvedTagName ? (
                  <QuestTagPill
                    tag={{
                      id: `${block.id}-${block.resolvedTagName}`,
                      name: block.resolvedTagName,
                      color: category?.accent ?? '#22c55e',
                    }}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">All items count</span>
                )}
              </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/40">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#22c55e_50%,#16a34a_100%)] shadow-[0_0_18px_rgba(34,197,94,0.35)] transition-all"
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

          <Button
            onClick={onClaim}
            disabled={!quest.claimable || claiming}
            className="h-11 w-full rounded-2xl font-black uppercase tracking-wide"
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
  );
}

function RewardTier({ rewards, rewardCatalog, isPremium }: { rewards: QuestReward[]; rewardCatalog: Record<string, ItemDef>; isPremium: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {rewards.map((reward, index) => (
        <RewardTile
          key={`${reward.type}-${reward.itemId ?? reward.amount ?? index}`}
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
        />
      ))}
    </div>
  );
}

function RewardTile({ reward, rewardCatalog, isPremium, compact = false }: { reward: QuestReward; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; compact?: boolean }) {
  const item = reward.itemId ? rewardCatalog[reward.itemId] : null;
  const amount = reward.type === 'FLIES' ? (reward.amount ?? 0) * (isPremium ? 2 : 1) : isPremium ? 2 : 1;
  const previewIndices = item
    ? {
        skin: item.slot === 'skin' ? item.riveIndex : 0,
        mood: 0,
        hat: item.slot === 'hat' ? item.riveIndex : 0,
        body: item.slot === 'body' ? item.riveIndex : 0,
        hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
      }
    : null;

  return (
    <div
      className={cn(
        'group relative flex items-center justify-center overflow-hidden shadow-sm',
        compact
          ? 'h-14 w-14 overflow-visible rounded-[18px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.96))] shadow-[0_14px_28px_rgba(15,23,42,0.24)] backdrop-blur-sm'
          : 'h-16 w-16 rounded-2xl border border-border/50 bg-card',
      )}
      title={rewardLabel(reward, rewardCatalog, isPremium)}
    >
      {!compact && <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-black/5 dark:from-white/5 dark:to-black/10" />}
      {reward.type === 'FLIES' ? (
        <div className="relative flex h-full w-full items-center justify-center">
          <Fly size={compact ? 28 : 28} y={-1} />
        </div>
      ) : item?.slot === 'container' ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className={cn(compact ? 'h-[112%] w-[112%] -translate-y-1 drop-shadow-lg' : 'h-full w-full scale-[0.9]')}>
            <GiftRive className="h-full w-full" color={item.riveIndex} />
          </div>
        </div>
      ) : previewIndices ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Frog
            className={cn(
              'object-contain',
              compact ? 'h-[116%] w-[116%] translate-y-[6%]' : 'translate-y-[10%]',
            )}
            indices={previewIndices}
            width={compact ? 84 : 84}
            height={compact ? 84 : 84}
          />
        </div>
      ) : reward.type === 'BOX' ? (
        <Gift className={cn('relative text-primary', compact ? 'h-5 w-5' : 'h-6 w-6')} />
      ) : (
        <Trophy className={cn('relative text-primary', compact ? 'h-5 w-5' : 'h-6 w-6')} />
      )}

      <div className={cn('absolute flex justify-center', compact ? '-right-1.5 -top-1.5' : 'inset-x-1 bottom-1')}>
        <span className={cn('font-black uppercase tracking-wide text-white shadow-sm', compact ? 'flex h-5 min-w-5 items-center justify-center rounded-full border border-white/20 bg-black px-1.5 text-[9px]' : 'rounded-full bg-black/75 px-1.5 py-0.5 text-[9px]')}>
          {reward.type === 'FLIES' ? amount : `x${amount}`}
        </span>
      </div>
    </div>
  );
}

function rewardLabel(reward: QuestReward, rewardCatalog: Record<string, ItemDef>, isPremium = false) {
  if (reward.type === 'FLIES') return `${(reward.amount ?? 0) * (isPremium ? 2 : 1)} flies`;
  if (reward.itemId) return `${rewardCatalog[reward.itemId]?.name ?? reward.itemId}${isPremium ? ' x2' : ''}`;
  return 'Reward';
}
