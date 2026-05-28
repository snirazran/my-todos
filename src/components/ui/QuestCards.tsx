'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  Clock,
  Compass,
  Gift,
  Pencil,
  Plus,
  Sparkles,
  Tags,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  MacroCategoryDefinition,
  QuestPlacement,
  QuestReward,
  ResolvedQuestLogicBlock,
} from '@/lib/quests/types';
import Fly from './fly';
import Frog from './frog';
import { GiftRive } from './gift-box/GiftBox';
import { ItemCard } from './skins/ItemCard';

export type QuestRewardCatalogItem = Pick<
  ItemDef,
  'id' | 'name' | 'slot' | 'rarity' | 'riveIndex'
>;

export type QuestTagChip = {
  id: string;
  name: string;
  color: string;
};

export type QuestCardLogicBlock = Pick<
  ResolvedQuestLogicBlock,
  | 'id'
  | 'type'
  | 'subject'
  | 'action'
  | 'target'
  | 'progress'
  | 'tagMode'
  | 'resolvedTagName'
  | 'resolvedTagNames'
  | 'rewards'
> & {
  targetLabel?: string;
  previewTagLabel?: string;
};

type QuestCardData = {
  id: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryDefinition['id'];
  title: string;
  description: string;
  coverImageUrl?: string;
  durationMinutes?: number;
  startedAt?: string;
  expiresAt?: string;
  logic: QuestCardLogicBlock[];
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  claimedObjectiveIds?: string[];
};

type BaseCardProps = {
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claiming?: boolean;
  claimingObjectiveId?: string | null;
  onClaimObjective?: (objectiveId: string) => void;
  paused?: boolean;
};

type RewardPopupState = {
  eyebrow: string;
  title: string;
  rewards: QuestReward[];
};

const REWARD_TILE_TONE: Record<
  ItemDef['rarity'] | 'flies' | 'default',
  { border: string; bg: string; shadow: string }
> = {
  common: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    shadow: 'shadow-slate-900/10',
  },
  uncommon: {
    border: 'border-emerald-400',
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-900/10',
  },
  rare: {
    border: 'border-sky-400',
    bg: 'bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-sky-900/10',
  },
  epic: {
    border: 'border-violet-400',
    bg: 'bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-violet-900/20',
  },
  legendary: {
    border: 'border-amber-400',
    bg: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-amber-900/30',
  },
  flies: {
    border: 'border-emerald-500',
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-900/10',
  },
  default: {
    border: 'border-border/40',
    bg: 'bg-muted/30',
    shadow: 'shadow-sm',
  },
};

export function formatQuestObjective(block: QuestCardLogicBlock) {
  const targetLabel =
    block.targetLabel ?? String(Math.max(0, block.target ?? 0));

  if (block.type === 'focus_minutes') {
    return block.tagMode === 'focus_category_tags'
      ? `Focus for ${targetLabel} minutes on tagged tasks`
      : `Focus for ${targetLabel} minutes on tasks`;
  }

  const numericTarget = Math.max(0, block.target ?? 0);
  const subjectLabel =
    block.subject === 'any'
      ? 'tasks'
      : numericTarget === 1 && !targetLabel.includes('-')
        ? 'task'
        : 'tasks';

  const actionLabel = block.action === 'add' ? 'Add' : 'Complete';
  const scopeLabel =
    block.tagMode === 'focus_category_tags'
      ? `${subjectLabel} with focus tags`
      : subjectLabel;
  return `${actionLabel} ${targetLabel} ${scopeLabel}`;
}

function renderObjectiveLabel(
  block: QuestCardLogicBlock,
  context: {
    linkedTags?: QuestTagChip[];
    categoryName?: string;
    categoryAccent?: string;
    onPickTags?: () => void;
  },
) {
  if (block.tagMode !== 'focus_category_tags') {
    return formatQuestObjective(block);
  }

  const targetLabel =
    block.targetLabel ?? String(Math.max(0, block.target ?? 0));
  const numericTarget = Math.max(0, block.target ?? 0);
  const isMinutes = block.type === 'focus_minutes';
  const subjectLabel = isMinutes
    ? 'minutes on tasks'
    : numericTarget === 1 && !targetLabel.includes('-')
      ? 'task'
      : 'tasks';
  const actionLabel = isMinutes
    ? 'Focus for'
    : block.action === 'add'
      ? 'Add'
      : 'Complete';

  const tags = context.linkedTags ?? [];
  if (tags.length > 0) {
    return (
      <>
        <span>{`${actionLabel} ${targetLabel} ${subjectLabel} with`}</span>
        {tags.map((tag) => (
          <QuestTagPill key={tag.id} tag={tag} />
        ))}
        <span>{tags.length > 1 ? 'tags' : 'tag'}</span>
      </>
    );
  }

  return <span>{`${actionLabel} ${targetLabel} ${subjectLabel}`}</span>;
}

function getTaggedSubjectCopy(block: QuestCardLogicBlock) {
  if (block.type === 'focus_minutes') return 'tasks';

  const subject = block.subject;
  if (subject === 'task') return 'tasks';
  return 'tasks';
}

function getTagScopeMessage(block: QuestCardLogicBlock) {
  const scopedSubject = getTaggedSubjectCopy(block);

  if (block.tagMode === 'focus_category_tags') {
    return `Only ${scopedSubject} with the selected tags count.`;
  }

  if (
    block.resolvedTagName ||
    block.resolvedTagNames?.length ||
    block.previewTagLabel
  ) {
    return `Only ${scopedSubject} with the shown tag${block.resolvedTagNames?.length && block.resolvedTagNames.length > 1 ? 's' : ''} count.`;
  }

  return null;
}

function useTimeLeft() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function calc() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diffMs = midnight.getTime() - now.getTime();
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }
    setLabel(calc());
    const id = setInterval(() => setLabel(calc()), 60_000);
    return () => clearInterval(id);
  }, []);
  return label;
}

function useDelayedHydration<T extends HTMLElement>(
  delayMs = 0,
  rootMargin = '360px',
) {
  const ref = useRef<T | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isNear = entry.isIntersecting;
        setNearViewport(isNear);
      },
      { rootMargin, threshold: [0, 0.01] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (!nearViewport || hasHydrated) return;
    const timer = window.setTimeout(() => setHasHydrated(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, hasHydrated, nearViewport]);

  useEffect(() => {
    if (!hasHydrated || nearViewport) return;
    const timer = window.setTimeout(() => setHasHydrated(false), 2400);
    return () => window.clearTimeout(timer);
  }, [hasHydrated, nearViewport]);

  return { ref, hasHydrated };
}

function formatCountdown(diffMs: number) {
  if (diffMs <= 0) return 'Expired';
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function useCountdownLabel(expiresAt?: string) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!expiresAt) {
      setLabel('');
      return;
    }

    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end)) {
      setLabel('');
      return;
    }

    const calc = () => formatCountdown(end - Date.now());
    setLabel(calc());
    const id = setInterval(() => setLabel(calc()), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return label;
}

function useHiddenClaimedObjectives(
  questId: string,
  claimedObjectiveIds: string[],
) {
  const claimedKey = claimedObjectiveIds.join('|');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(claimedObjectiveIds),
  );
  const previousClaimedRef = useRef<Set<string>>(new Set(claimedObjectiveIds));

  useEffect(() => {
    const next = new Set(claimedObjectiveIds);
    previousClaimedRef.current = next;
    setHiddenIds(next);
  }, [questId]);

  useEffect(() => {
    const previous = previousClaimedRef.current;
    const timers: number[] = [];

    for (const id of claimedObjectiveIds) {
      if (previous.has(id)) continue;
      timers.push(
        window.setTimeout(() => {
          setHiddenIds((current) => {
            const next = new Set(current);
            next.add(id);
            return next;
          });
        }, 1000),
      );
    }

    previousClaimedRef.current = new Set(claimedObjectiveIds);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [claimedKey]);

  return hiddenIds;
}

export function DailyQuestPresentationCard({
  quest,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
  paused = false,
}: BaseCardProps & {
  quest: QuestCardData & { placement: 'daily' };
}) {
  const timeLeft = useTimeLeft();
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const claimedObjectiveIds = quest.claimedObjectiveIds ?? [];
  const hiddenClaimedObjectiveIds = useHiddenClaimedObjectives(
    quest.id,
    claimedObjectiveIds,
  );
  const visibleLogic = quest.logic.filter(
    (block) => !hiddenClaimedObjectiveIds.has(block.id),
  );

  const isCompleted = visibleLogic.length === 0;

  return (
    <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
      <div className="relative overflow-hidden">
        {quest.coverImageUrl ? (
          <img
            src={quest.coverImageUrl}
            alt={quest.title}
            loading="lazy"
            decoding="async"
            className="h-[150px] w-full object-cover"
          />
        ) : (
          <div className="h-[150px] w-full bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#0f172a_100%)]" />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
        {isCompleted && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 px-4 text-center text-white">
            <Check className="h-9 w-9 text-emerald-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]" strokeWidth={3.5} />
            <p className="text-base font-black tracking-tight drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
              All daily objectives done!
            </p>
            {timeLeft ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85 drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]">
                  Resets in
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
                  style={{
                    fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                    WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
                    paintOrder: 'stroke fill',
                    lineHeight: 1,
                  }}
                >
                  <Clock className="h-4 w-4 shrink-0 translate-y-[1px]" strokeWidth={3} />
                  <span className="leading-none">{timeLeft}</span>
                </span>
              </div>
            ) : null}
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <span
            className="inline-flex items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
              paintOrder: 'stroke fill',
            }}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
            <span className="leading-none">Daily</span>
          </span>
          {timeLeft && !isCompleted ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
                paintOrder: 'stroke fill',
              }}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
              <span className="leading-none">{timeLeft}</span>
            </span>
          ) : null}
        </div>
      </div>

      {!isCompleted && (
      <div className="px-4 pt-1 pb-4">
        {(
          visibleLogic.map((block, i) => (
            <ObjectiveRow
              key={block.id}
              block={block}
              objectiveClaimed={claimedObjectiveIds.includes(block.id)}
              claimingObjective={claimingObjectiveId === block.id}
              isPremium={isPremium}
              rewardCatalog={rewardCatalog}
              paused={true}
              onOpenRewards={(rewards) =>
                setRewardPopup({
                  eyebrow: 'Objective',
                  title: 'Rewards',
                  rewards,
                })
              }
              onClaimObjective={
                onClaimObjective ? () => onClaimObjective(block.id) : undefined
              }
              isLast={i === visibleLogic.length - 1}
              isFirst={i === 0}
            />
          ))
        )}

      </div>
      )}
      <RewardDetailsPopup
        open={!!rewardPopup}
        eyebrow={rewardPopup?.eyebrow ?? ''}
        title={rewardPopup?.title ?? ''}
        rewards={rewardPopup?.rewards ?? []}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setRewardPopup(null)}
        paused={paused}
      />
    </div>
  );
}

export function CategoryQuestPresentationCard({
  quest,
  category,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  linkedTags,
  onEditTags,
  onClaimObjective,
  paused = false,
}: BaseCardProps & {
  quest: QuestCardData & {
    placement: 'category';
    categoryId: MacroCategoryDefinition['id'];
  };
  category?: MacroCategoryDefinition;
  linkedTags: QuestTagChip[];
  onEditTags?: () => void;
}) {
  const heroImageUrl = category?.coverImageUrl ?? quest.coverImageUrl;
  const timeLeft = useCountdownLabel(quest.expiresAt);
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const claimedObjectiveIds = quest.claimedObjectiveIds ?? [];
  const hiddenClaimedObjectiveIds = useHiddenClaimedObjectives(
    quest.id,
    claimedObjectiveIds,
  );
  const visibleLogic = quest.logic.filter(
    (block) => !hiddenClaimedObjectiveIds.has(block.id),
  );
  const usesFocusTags = quest.logic.some(
    (block) => block.tagMode === 'focus_category_tags',
  );
  const needsFocusTags = usesFocusTags && linkedTags.length === 0;
  const isCompleted = visibleLogic.length === 0;

  return (
    <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
      <div className="relative overflow-hidden">
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={category?.name ?? quest.title}
            loading="lazy"
            decoding="async"
            className="h-[150px] w-full object-cover"
          />
        ) : (
          <div
            className="h-[150px] w-full"
            style={{
              background: `linear-gradient(135deg, ${category?.backgroundFrom ?? '#0f172a'}, ${category?.backgroundTo ?? '#1e293b'})`,
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
        {isCompleted && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 px-4 text-center text-white">
            <Check className="h-9 w-9 text-emerald-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]" strokeWidth={3.5} />
            <p className="text-base font-black tracking-tight drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
              Quest complete!
            </p>
            {timeLeft ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85 drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]">
                  Refreshes in
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
                  style={{
                    fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                    WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
                    paintOrder: 'stroke fill',
                    lineHeight: 1,
                  }}
                >
                  <Clock className="h-4 w-4 shrink-0 translate-y-[1px]" strokeWidth={3} />
                  <span className="leading-none">{timeLeft}</span>
                </span>
              </div>
            ) : null}
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <span
            className="inline-flex max-w-[calc(100%-5rem)] items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
              paintOrder: 'stroke fill',
            }}
          >
            <Compass className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
            <span className="truncate leading-none">
              {category?.shortLabel || category?.name || 'Focus'}
            </span>
          </span>
          {timeLeft && !isCompleted ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-[15px] uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]"
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.9)',
                paintOrder: 'stroke fill',
              }}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
              <span className="leading-none">{timeLeft}</span>
            </span>
          ) : null}
        </div>
      </div>

      {!isCompleted && (
      <div className="px-4 pt-1 pb-4 sm:px-5 sm:pb-5">
        {usesFocusTags && (
          <FocusQuestTagPanel
            linkedTags={linkedTags}
            accent={category?.accent ?? '#22c55e'}
            onEditTags={onEditTags}
            categoryName={category?.shortLabel || category?.name}
          />
        )}
        {visibleLogic.map((block, i) => (
          <div key={block.id}>
            <ObjectiveRow
              block={block}
              objectiveClaimed={claimedObjectiveIds.includes(block.id)}
              claimingObjective={claimingObjectiveId === block.id}
              isPremium={isPremium}
              rewardCatalog={rewardCatalog}
              paused={true}
              onOpenRewards={(rewards) =>
                setRewardPopup({
                  eyebrow: 'Objective',
                  title: 'Rewards',
                  rewards,
                })
              }
              onClaimObjective={
                onClaimObjective ? () => onClaimObjective(block.id) : undefined
              }
              isLast={i === visibleLogic.length - 1}
              isFirst={i === 0}
              linkedTags={linkedTags}
              categoryName={category?.shortLabel || category?.name}
              categoryAccent={category?.accent}
              onPickTags={onEditTags}
            />
            {block.tagMode !== 'focus_category_tags' &&
            getTagScopeMessage(block) ? (
              <p className="px-1 mb-2 -mt-2 text-xs font-medium text-muted-foreground">
                {getTagScopeMessage(block)}
              </p>
            ) : null}
            {block.tagMode !== 'focus_category_tags' && (
              <div className="flex flex-wrap items-center gap-2 -mt-1.5 mb-1 px-1">
                {block.resolvedTagNames?.length ? (
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
                ) : block.previewTagLabel ? (
                  <PreviewTagHint
                    label={block.previewTagLabel}
                    color={category?.accent ?? '#22c55e'}
                  />
                ) : null}
              </div>
            )}
          </div>
        ))}

      </div>
      )}
      <RewardDetailsPopup
        open={!!rewardPopup}
        eyebrow={rewardPopup?.eyebrow ?? ''}
        title={rewardPopup?.title ?? ''}
        rewards={rewardPopup?.rewards ?? []}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setRewardPopup(null)}
      />
    </div>
  );
}

function progressBarColor(pct: number, complete: boolean, claimed: boolean) {
  if (claimed) return 'bg-emerald-400 dark:bg-emerald-500';
  if (complete) return 'bg-emerald-500 dark:bg-emerald-400';
  if (pct >= 80) return 'bg-emerald-500 dark:bg-emerald-400';
  if (pct >= 50) return 'bg-amber-400 dark:bg-amber-500';
  return 'bg-amber-400 dark:bg-amber-500';
}

function ObjectiveRow({
  block,
  objectiveClaimed,
  claimingObjective,
  isPremium,
  rewardCatalog,
  onOpenRewards,
  onClaimObjective,
  isLast,
  isFirst,
  paused = false,
  linkedTags,
  categoryName,
  categoryAccent,
  onPickTags,
}: {
  block: QuestCardLogicBlock;
  objectiveClaimed?: boolean;
  claimingObjective?: boolean;
  isPremium?: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onOpenRewards?: (rewards: QuestReward[]) => void;
  onClaimObjective?: () => void;
  isLast?: boolean;
  isFirst?: boolean;
  paused?: boolean;
  linkedTags?: QuestTagChip[];
  categoryName?: string;
  categoryAccent?: string;
  onPickTags?: () => void;
}) {
  const safeTarget = Math.max(1, block.target);
  const objectiveComplete = block.progress >= safeTarget;
  const pct = Math.min(100, (block.progress / safeTarget) * 100);
  const hasRewards = (block.rewards?.length ?? 0) > 0;
  const objectiveClaimable =
    hasRewards && objectiveComplete && !objectiveClaimed;

  const stepDone = objectiveClaimed || (objectiveComplete && !hasRewards);
  const needsTag =
    block.tagMode === 'focus_category_tags' &&
    (linkedTags?.length ?? 0) === 0;

  const renderActionSlot = () => {
    if (objectiveClaimable && onClaimObjective) {
      return (
        <button
          type="button"
          onClick={onClaimObjective}
          disabled={claimingObjective}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#059669] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#059669] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="mr-[-0.15em]">
            {claimingObjective ? 'Claiming...' : 'Claim'}
          </span>
        </button>
      );
    }
    if (objectiveClaimed) {
      return (
        <div className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3">
          <Check className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600/70 dark:text-emerald-400/70">
            Claimed
          </span>
        </div>
      );
    }
    return (
      <div
        className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-xl bg-muted px-4 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 shadow-[0_3px_0_0_rgba(15,23,42,0.12)]"
        aria-disabled
      >
        <span className="mr-[-0.15em]">Claim</span>
      </div>
    );
  };

  const firstReward = hasRewards ? block.rewards![0] : null;
  const extraRewardCount = hasRewards ? block.rewards!.length - 1 : 0;

  return (
    <div
      className={cn(
        'py-3 transition-opacity',
        !isLast && 'border-b border-border/20',
        needsTag && 'opacity-50 saturate-50',
      )}
      aria-disabled={needsTag || undefined}
    >
      <div className="flex items-center gap-3">
        {firstReward ? (
          <div className="relative shrink-0">
            <RewardTile
              reward={firstReward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium ?? false}
              compact
              paused={paused}
              className="h-16 w-16 rounded-2xl"
              hydrateDelayMs={150}
              onClick={() => onOpenRewards?.(block.rewards ?? [])}
            />
            {extraRewardCount > 0 && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 z-30 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-white/10 bg-black/55 px-1 text-[9px] font-black uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                +{extraRewardCount}
              </span>
            )}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-black leading-snug md:text-base',
              stepDone
                ? 'text-emerald-600 line-through decoration-emerald-500/60 dark:text-emerald-400'
                : 'text-foreground',
            )}
          >
            {renderObjectiveLabel(block, {
              linkedTags,
              categoryName,
              categoryAccent,
              onPickTags,
            })}
          </p>

          <div className="relative mt-2 h-6 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-1">
              <div
                className={cn(
                  'h-full min-w-5 rounded-full transition-all duration-500',
                  progressBarColor(
                    pct,
                    objectiveComplete,
                    objectiveClaimed ?? false,
                  ),
                )}
                style={{ width: pct > 0 ? `${pct}%` : '1.25rem' }}
              />
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black tabular-nums text-foreground/70">
              {Math.min(block.progress, safeTarget)}
              {' / '}
              {block.targetLabel ?? block.target}
            </span>
          </div>
        </div>

        <div className="shrink-0">{renderActionSlot()}</div>
      </div>
    </div>
  );
}

function QuestTagPill({ tag }: { tag: QuestTagChip }) {
  return (
    <span
      className="relative inline-flex max-w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-sm"
      style={{
        backgroundColor: `${tag.color}20`,
        borderColor: `${tag.color}40`,
        color: tag.color,
      }}
    >
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

function FocusQuestTagPanel({
  linkedTags,
  accent,
  onEditTags,
  categoryName,
}: {
  linkedTags: QuestTagChip[];
  accent: string;
  onEditTags?: () => void;
  categoryName?: string;
}) {
  if (linkedTags.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1 mt-3 mb-1">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Focus tags
        </span>
        {linkedTags.map((tag) => (
          <QuestTagPill key={tag.id} tag={tag} />
        ))}
        {onEditTags ? (
          <button
            type="button"
            onClick={onEditTags}
            aria-label="Edit focus tags"
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 mb-1 flex items-center gap-3 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Tags className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-black leading-tight text-foreground">
          Pick your {categoryName ? `${categoryName.toLowerCase()} ` : ''}tag
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          Tasks with this tag count toward the quest.
        </p>
      </div>
      {onEditTags ? (
        <button
          type="button"
          onClick={onEditTags}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow-[0_2px_0_rgba(15,23,42,0.18)] transition active:translate-y-0.5 active:shadow-none"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          Pick a tag
        </button>
      ) : (
        <PreviewTagHint label="Saved focus tags" color={accent} />
      )}
    </div>
  );
}

function PreviewTagHint({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border border-dashed px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}5c`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function RewardDetailsPopup({
  open,
  eyebrow,
  title,
  rewards,
  rewardCatalog,
  isPremium,
  onClose,
  paused = false,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  rewards: QuestReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onClose: () => void;
  paused?: boolean;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
            <h3 className="mt-1 text-2xl font-black leading-none text-foreground">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center transition border rounded-lg h-9 w-9 border-border/50 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close reward details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5 sm:gap-4">
          {rewards.map((reward, index) => (
            <QuestRewardDetailCard
              key={`${reward.type}-${reward.itemId ?? reward.amount ?? reward.minAmount ?? index}`}
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              paused={paused}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QuestRewardDetailCard({
  reward,
  rewardCatalog,
  isPremium,
  paused = false,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused?: boolean;
}) {
  const item = reward.itemId ? rewardCatalog[reward.itemId] : null;

  if (!item) {
    const quantityLabel = getRewardQuantityLabel(reward, isPremium);

    return (
      <div className="relative flex flex-col overflow-hidden rounded-2xl border-[3px] border-emerald-500 bg-emerald-50 p-2.5 text-center shadow-emerald-500/15 dark:bg-emerald-950/30">
        <div className="relative mx-auto mt-4 mb-2 flex aspect-[1/0.75] w-full items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-900/40 dark:to-emerald-950/40">
          <div className="absolute right-1.5 top-1.5 z-20 rounded-lg border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm">
            {quantityLabel}
          </div>
          <Fly size={62} y={-1} paused={paused} interactive={false} />
        </div>
        <p className="pb-1 text-xs font-bold leading-tight text-foreground">
          {rewardLabel(reward, rewardCatalog, isPremium)}
        </p>
      </div>
    );
  }

  const itemDef: ItemDef = {
    ...item,
    icon: '',
    priceFlies: 0,
  };

  return (
    <ItemCard
      item={itemDef}
      ownedCount={getRewardOwnedCount(reward, isPremium)}
      isEquipped={false}
      canAfford
      actionLoading={false}
      mode="inventory"
      hidePrice
      customAction={<div className="h-0" />}
      pausePreview={paused}
    />
  );
}

export const RewardTile = memo(function RewardTile({
  reward,
  rewardCatalog,
  isPremium,
  compact = false,
  className,
  onClick,
  hydrateDelayMs = 0,
  paused = false,
  hideBadge = false,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
  hydrateDelayMs?: number;
  paused?: boolean;
  hideBadge?: boolean;
}) {
  const { ref, hasHydrated } = useDelayedHydration<HTMLDivElement>(
    hydrateDelayMs,
  );
  const item = reward.itemId ? rewardCatalog[reward.itemId] : null;
  const tone = item
    ? REWARD_TILE_TONE[item.rarity]
    : reward.type === 'FLIES'
      ? REWARD_TILE_TONE.flies
      : REWARD_TILE_TONE.default;
  const quantityLabel = getRewardQuantityLabel(reward, isPremium);
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
      ref={ref}
      className={cn(
        'group relative flex items-center justify-center overflow-visible border-2 shadow-sm',
        tone.border,
        tone.bg,
        tone.shadow,
        compact ? 'h-16 w-16 rounded-[20px]' : 'h-12 w-12 rounded-xl',
        onClick &&
          'cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
      title={rewardLabel(reward, rewardCatalog, isPremium)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {reward.type === 'FLIES' ? (
        <div className="relative flex items-center justify-center w-full h-full">
          <Fly
            size={compact ? 30 : 22}
            y={-1}
            paused={paused}
            interactive={false}
          />
        </div>
      ) : item?.slot === 'container' && hasHydrated ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className={cn(
              compact
                ? 'h-[118%] w-[118%] drop-shadow-lg'
                : 'h-[120%] w-[120%]',
            )}
          >
            <GiftRive className="w-full h-full" color={item.riveIndex} paused={false} />
          </div>
        </div>
      ) : previewIndices && hasHydrated ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Frog
            className={cn(
              'object-contain',
              compact
                ? 'h-[118%] w-[118%]'
                : 'h-[120%] w-[120%] translate-y-[8%]',
            )}
            indices={previewIndices}
            width={compact ? 96 : 64}
            height={compact ? 96 : 64}
            paused={paused}
          />
        </div>
      ) : item || reward.type === 'BOX' ? (
        <RewardTileGloss />
      ) : (
        <Trophy
          className={cn(
            'relative text-primary',
            compact ? 'h-5 w-5' : 'h-4 w-4',
          )}
        />
      )}

      {!hideBadge && (
        <div
          className={cn(
            'absolute z-20 flex justify-center',
            compact ? '-right-1 -top-1' : '-right-0.5 -top-0.5',
          )}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-md border border-white/10 bg-black/50 font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm',
              compact
                ? 'min-w-5 px-1.5 py-0.5 text-[9px]'
                : 'min-w-4 px-1 py-0.5 text-[8px]',
            )}
          >
            {quantityLabel}
          </span>
        </div>
      )}
    </div>
  );
});

function RewardTileGloss() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="absolute inset-y-[-24%] left-0 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-90 animate-shine dark:via-current dark:opacity-20" />
    </div>
  );
}

function rewardLabel(
  reward: QuestReward,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium = false,
) {
  if (reward.type === 'FLIES')
    return `${getRewardQuantityLabel(reward, isPremium)} flies`;
  if (reward.itemId) {
    return rewardCatalog[reward.itemId]?.name ?? reward.itemId;
  }
  return 'Reward';
}

export function getRewardQuantityLabel(reward: QuestReward, _isPremium: boolean) {
  if (reward.type === 'FLIES') {
    if (reward.amountMode === 'random') {
      const min = Math.max(1, reward.minAmount ?? 1);
      const max = Math.max(min, reward.maxAmount ?? min);
      return min === max ? String(max) : `${min}-${max}`;
    }

    return String(Math.max(0, reward.amount ?? 0));
  }

  const base = reward.amount && reward.amount > 1 ? reward.amount : 1;
  return `x${base}`;
}

function getRewardOwnedCount(reward: QuestReward, _isPremium: boolean) {
  const base = reward.amount && reward.amount > 1 ? reward.amount : 1;
  return base;
}

