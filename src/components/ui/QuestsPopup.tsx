'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import { Crown, Gift, Lock, ScrollText, Sparkles, TimerReset, Trophy, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Fly from './fly';
import type { ItemDef } from '@/lib/skins/catalog';
import type { CampaignProgressView, DailyQuestProgressView, FocusCategoryTagMap, MacroCategoryDefinition, MacroCategoryId, QuestReward } from '@/lib/quests/types';

type SavedTag = { id: string; name: string; color: string; disabled?: boolean };
type QuestsResponse = {
  isPremium: boolean;
  claimableCount: number;
  onboarding: { complete: boolean; selectedCategoryIds: MacroCategoryId[]; categoryTagMap: FocusCategoryTagMap[] };
  macroCategories: MacroCategoryDefinition[];
  dailyQuests: DailyQuestProgressView[];
  campaigns: CampaignProgressView[];
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
  const [activeTab, setActiveTab] = useState<'daily' | 'campaigns'>('campaigns');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [savingMappings, setSavingMappings] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [draftMappings, setDraftMappings] = useState<FocusCategoryTagMap[]>([]);
  const dragControls = useDragControls();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, error, isLoading, mutate: mutateQuests } = useSWR<QuestsResponse>(
    show && !isGuest ? `/api/quests?timezone=${encodeURIComponent(timezone)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: tagsData } = useSWR<{ tags: SavedTag[] }>(
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
    setDraftMappings(data?.onboarding.categoryTagMap ?? []);
  }, [data?.onboarding.categoryTagMap]);

  const categoryMap = useMemo(
    () => Object.fromEntries((data?.macroCategories ?? []).map((entry) => [entry.id, entry])),
    [data?.macroCategories],
  );
  const selectedCategories = useMemo(
    () => (data?.onboarding.selectedCategoryIds ?? []).map((id) => categoryMap[id]).filter(Boolean),
    [categoryMap, data?.onboarding.selectedCategoryIds],
  );
  const savedMappedCategoryIds = useMemo(
    () =>
      new Set(
        (data?.onboarding.categoryTagMap ?? [])
          .filter((entry) => entry.tagIds.length > 0)
          .map((entry) => entry.categoryId),
      ),
    [data?.onboarding.categoryTagMap],
  );
  const availableTags = tagsData?.tags ?? [];
  const claimableDaily = data?.dailyQuests.filter((quest) => quest.claimable).length ?? 0;
  const claimableCampaigns = data?.campaigns.filter((campaign) => campaign.claimable).length ?? 0;

  const getMappedTagIds = (categoryId: MacroCategoryId) =>
    draftMappings.find((entry) => entry.categoryId === categoryId)?.tagIds ?? [];

  const toggleTagForCategory = (categoryId: MacroCategoryId, tagId: string) => {
    setDraftMappings((prev) => {
      const current = prev.find((entry) => entry.categoryId === categoryId);
      if (!current) return [...prev, { categoryId, tagIds: [tagId] }];
      const hasTag = current.tagIds.includes(tagId);
      return prev.map((entry) =>
        entry.categoryId !== categoryId
          ? entry
          : { ...entry, tagIds: hasTag ? entry.tagIds.filter((id) => id !== tagId) : [...entry.tagIds, tagId] },
      );
    });
  };

  const saveMappings = async () => {
    if (!data || savingMappings) return;
    setSavingMappings(true);
    setSetupMessage(null);
    try {
      const res = await fetch('/api/quests/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategoryIds: data.onboarding.selectedCategoryIds,
          categoryTagMap: draftMappings.filter((entry) => entry.tagIds.length > 0),
          createSuggestions: false,
          timezone,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save campaign setup');
      setSetupMessage('Campaign setup saved');
      await mutateQuests();
    } catch (err: any) {
      setSetupMessage(err.message || 'Could not save campaign setup');
    } finally {
      setSavingMappings(false);
    }
  };

  const handleClaim = async (claimType: 'daily' | 'campaign', targetId: string) => {
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
      if (payload.rewardSummary?.grantedAnimationIds?.length) bits.push(`${payload.rewardSummary.grantedAnimationIds.length} animation unlocks`);
      setClaimMessage(bits.length ? `Claimed ${bits.join(' + ')}` : 'Reward claimed');
      await mutateQuests();
      mutate('/api/skins/inventory');
    } catch (err: any) {
      setClaimMessage(err.message || 'Claim failed');
    } finally {
      setClaimingId(null);
    }
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
                    <p className="text-sm text-muted-foreground">Daily quests plus category campaigns tied to your focus.</p>
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
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'daily' | 'campaigns')}>
                      <TabsList className="grid h-14 w-full grid-cols-2 rounded-[20px] border border-border/50 bg-muted/40 p-1">
                        <TabsTrigger value="campaigns" className="rounded-[16px] text-xs font-black uppercase tracking-[0.18em] text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground">Campaigns{claimableCampaigns > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{claimableCampaigns}</span>}</TabsTrigger>
                        <TabsTrigger value="daily" className="rounded-[16px] text-xs font-black uppercase tracking-[0.18em] text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground">Daily Quests{claimableDaily > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{claimableDaily}</span>}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {claimMessage && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground">{claimMessage}</div>}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-6">
                    {activeTab === 'campaigns' ? (
                      <div className="space-y-4">
                        {!data.onboarding.complete && <PanelCard>Finish your onboarding on the home page to unlock category campaigns.</PanelCard>}
                        {data.onboarding.complete && selectedCategories.length > 0 && (
                          <div className="rounded-[28px] border border-border/50 bg-card/90 p-5 shadow-sm">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Campaign Setup</p>
                                <h3 className="mt-1 text-xl font-black text-foreground">Choose which tags count for each focus area</h3>
                                <p className="mt-1 text-sm text-muted-foreground">Tasks, habits, and focus sessions only count toward a campaign when they use one of the tags you link here.</p>
                              </div>
                              <Button onClick={saveMappings} disabled={savingMappings} className="h-11 rounded-2xl font-black uppercase tracking-[0.12em]">{savingMappings ? 'Saving...' : 'Save Campaign Setup'}</Button>
                            </div>
                            {setupMessage && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground">{setupMessage}</div>}
                            {availableTags.length === 0 ? <div className="mt-4 rounded-[22px] border border-dashed border-border/50 bg-background/70 px-4 py-4 text-sm text-muted-foreground">Add tags to your tasks or habits first, then come back here to connect them to a campaign.</div> : (
                              <div className="mt-4 space-y-3">
                                {selectedCategories.map((category) => (
                                  <div key={category.id} className="rounded-[22px] border border-border/50 bg-background/80 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div><p className="text-sm font-black text-foreground">{category.name}</p><p className="text-sm text-muted-foreground">Link the tags that should count toward this campaign.</p></div>
                                      <span className="rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{getMappedTagIds(category.id).length} linked</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {availableTags.map((tag) => {
                                        const selected = getMappedTagIds(category.id).includes(tag.id);
                                        return <button key={tag.id} onClick={() => toggleTagForCategory(category.id, tag.id)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wide transition-all', selected ? 'border-primary/25 bg-primary/10 text-foreground' : 'border-border/50 bg-background text-muted-foreground hover:bg-muted/50')}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</button>;
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {data.campaigns.length === 0 ? <PanelCard>{selectedCategories.length > 0 && savedMappedCategoryIds.size < selectedCategories.length ? 'Save your tag links to start those campaigns.' : 'No active campaigns yet.'}</PanelCard> : data.campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} category={categoryMap[campaign.categoryId]} rewardCatalog={data.rewardCatalog} isPremium={data.isPremium} claiming={claimingId === campaign.id} onClaim={() => handleClaim('campaign', campaign.id)} />)}
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {data.dailyQuests.map((quest) => <DailyQuestCard key={quest.id} quest={quest} rewardCatalog={data.rewardCatalog} isPremium={data.isPremium} claiming={claimingId === quest.id} onClaim={() => handleClaim('daily', quest.id)} />)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
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
  return <div className="rounded-[26px] border border-border/50 bg-card/90 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Daily</p><h3 className="mt-1 text-lg font-black leading-tight text-foreground">{quest.title}</h3><p className="mt-1 text-sm text-muted-foreground">{quest.description}</p></div><div className="rounded-2xl border border-border/50 bg-background/80 px-3 py-2 text-center"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Progress</p><p className="mt-1 text-lg font-black text-foreground">{Math.min(quest.progress, quest.target)}/{quest.target}</p></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', quest.claimed ? 'bg-emerald-500' : quest.completed ? 'bg-primary' : 'bg-sky-500')} style={{ width: `${progressPercent}%` }} /></div><div className="mt-4 grid gap-3"><RewardTier title="Free" rewards={quest.rewards.free} rewardCatalog={rewardCatalog} /><RewardTier title="Premium" rewards={quest.rewards.premium} rewardCatalog={rewardCatalog} premium locked={!isPremium} /></div><Button onClick={onClaim} disabled={!quest.claimable || claiming} className="mt-4 h-11 w-full rounded-2xl font-black uppercase tracking-wide">{quest.claimed ? 'Claimed' : claiming ? 'Claiming...' : quest.claimable ? isPremium ? 'Claim Free + Premium' : 'Claim Free Reward' : 'Keep Going'}</Button></div>;
}

function CampaignCard({ campaign, category, rewardCatalog, isPremium, claiming, onClaim }: { campaign: CampaignProgressView; category?: MacroCategoryDefinition; rewardCatalog: Record<string, ItemDef>; isPremium: boolean; claiming: boolean; onClaim: () => void }) {
  const completedObjectives = campaign.objectives.filter((objective) => objective.completed).length;
  return <div className="relative overflow-hidden rounded-[28px] border border-border/50 bg-card/95 p-5 shadow-sm"><div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: category?.accent ?? '#22c55e' }} /><div className="absolute inset-0 opacity-60" style={{ backgroundImage: `radial-gradient(circle at top right, ${category?.accent ?? '#22c55e'}22, transparent 30%)` }} /><div className="relative"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-2xl"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground"><TimerReset className="h-3.5 w-3.5" />{formatCountdown(campaign.secondsLeft)}</span><span className="rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{campaign.durationDays} Day Campaign</span></div><p className="text-sm font-black uppercase tracking-[0.22em] text-primary">{campaign.categoryName}</p><h3 className="mt-1 text-3xl font-black tracking-tight text-foreground">{campaign.title}</h3><p className="mt-1 text-sm text-muted-foreground">{campaign.subtitle}</p><div className="mt-5 grid gap-3 md:grid-cols-3">{campaign.objectives.map((objective) => <div key={objective.id} className="rounded-[22px] border border-border/50 bg-background/80 p-3"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Objective</p><p className="mt-1 text-sm font-bold text-foreground">{objective.title}</p><p className="mt-1 text-xs text-muted-foreground">{objective.description}</p><div className="mt-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>{Math.min(objective.progress, objective.target)}/{objective.target}</span><span>{objective.completed ? 'Done' : 'Active'}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', objective.completed ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${Math.min(100, (objective.progress / objective.target) * 100)}%` }} /></div></div>)}</div></div><div className="w-full max-w-sm rounded-[24px] border border-border/50 bg-background/80 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rewards</p><p className="mt-1 text-sm font-bold text-foreground">{completedObjectives}/{campaign.objectives.length} objectives done</p></div><div className="rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{campaign.claimed ? 'Claimed' : campaign.claimable ? 'Ready' : 'In progress'}</div></div><RewardTier title="Free" rewards={campaign.rewards.free} rewardCatalog={rewardCatalog} /><RewardTier title="Premium" rewards={campaign.rewards.premium} rewardCatalog={rewardCatalog} premium locked={!isPremium} /><Button onClick={onClaim} disabled={!campaign.claimable || claiming} className="mt-4 h-11 w-full rounded-2xl font-black uppercase tracking-wide">{campaign.claimed ? 'Claimed' : claiming ? 'Claiming...' : campaign.claimable ? isPremium ? 'Claim Full Bundle' : 'Claim Free Bundle' : campaign.expired ? 'Expired' : 'Keep Pushing'}</Button></div></div></div></div>;
}

function RewardTier({ title, rewards, rewardCatalog, premium, locked }: { title: string; rewards: QuestReward[]; rewardCatalog: Record<string, ItemDef>; premium?: boolean; locked?: boolean }) {
  return <div className={cn('mt-3 rounded-[20px] border p-3', premium ? 'border-primary/20 bg-primary/10' : 'border-border/50 bg-card/80', locked && 'opacity-70')}><div className="mb-2 flex items-center justify-between"><p className={cn('text-[11px] font-black uppercase tracking-[0.2em]', premium ? 'text-primary' : 'text-muted-foreground')}>{title}</p>{locked ? <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground"><Lock className="h-3 w-3" />Locked</span> : premium ? <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-primary"><Crown className="h-3 w-3" />Premium</span> : null}</div><div className="flex flex-wrap gap-2">{rewards.map((reward, index) => <div key={`${reward.type}-${reward.itemId ?? reward.animationId ?? reward.amount ?? index}`} className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-2 text-xs font-bold text-foreground"><RewardIcon reward={reward} /><span>{rewardLabel(reward, rewardCatalog)}</span></div>)}</div></div>;
}

function RewardIcon({ reward }: { reward: QuestReward }) {
  if (reward.type === 'FLIES') return <Fly size={16} y={-1} />;
  if (reward.type === 'BOX') return <Gift className="h-4 w-4 text-primary" />;
  if (reward.type === 'ANIMATION') return <Sparkles className="h-4 w-4 text-primary" />;
  return <Trophy className="h-4 w-4 text-primary" />;
}

function rewardLabel(reward: QuestReward, rewardCatalog: Record<string, ItemDef>) {
  if (reward.type === 'FLIES') return `${reward.amount ?? 0} flies`;
  if (reward.type === 'ANIMATION') return reward.label ?? reward.animationId ?? 'Animation';
  if (reward.itemId) return rewardCatalog[reward.itemId]?.name ?? reward.itemId;
  return 'Reward';
}

function formatCountdown(secondsLeft: number) {
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  if (days > 0) return `${days}D ${hours}H`;
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  return `${hours}H ${minutes}M`;
}
