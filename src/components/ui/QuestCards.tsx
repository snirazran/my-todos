'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hapticSuccess } from '@/lib/haptics';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Copy,
  Gift,
  Monitor,
  Moon,
  Pencil,
  Play,
  Repeat,
  Sprout,
  TriangleAlert,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  metricObjectiveLabel,
  objectiveHintText,
} from '@/lib/quests/metricLabels';
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
import { BaseSheet } from '@/components/ui/BaseSheet';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';
import {
  HintButton,
  ObjectiveProgressBar,
  objectiveCardTone,
  useCompletionReveal,
} from '@/lib/questClaims';
import { guideContextForBlock, guideIdForBlock } from '@/lib/hints/guides';
import {
  resetCountdownLabel,
  scoreQuestPriority,
} from '@/lib/quests/priority';
import { useUIStore } from '@/lib/uiStore';

export type QuestRewardCatalogItem = Pick<
  ItemDef,
  'id' | 'name' | 'rarity' | 'riveIndex'
> & {
  slot: ItemDef['slot'] | 'background';
  imageUrl?: string;
};

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
  | 'metricKey'
  | 'helpText'
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
  lastProgressAt?: string;
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

const TASK_STREAK_METRIC_PATTERN = /^task_streak_(\d+)$/;

// "worth 🪰 190" — the fly with its total, number nudged down to sit level
// with the fly's visual center.
export function FlyWorth({
  amount,
  flySize = 28,
  numberClassName,
  iconClassName,
}: {
  amount: number;
  flySize?: number;
  numberClassName?: string;
  iconClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex', iconClassName)}>
        <Fly size={flySize} y={-1} paused interactive={false} />
      </span>
      <span
        className={cn(
          'translate-y-[2px] text-[13px] font-black tabular-nums text-foreground',
          numberClassName,
        )}
      >
        {amount}
      </span>
    </span>
  );
}

// Compact objective phrasing for one-line contexts (area rows).
function shortObjectiveLabel(block: QuestCardLogicBlock) {
  const target = Math.max(1, block.target ?? 1);
  const targetLabel = block.targetLabel ?? String(target);
  if (block.type === 'focus_minutes') return `Focus ${targetLabel} min`;
  if (block.type === 'metric_count') {
    const streakMatch = block.metricKey
      ? TASK_STREAK_METRIC_PATTERN.exec(block.metricKey)
      : null;
    if (streakMatch) {
      return `${streakMatch[1]}-day streak ×${target}`;
    }
    if (block.metricKey === 'buddy_task_completed') {
      return `${target} buddy task${target > 1 ? 's' : ''}`;
    }
    return metricObjectiveLabel(block.metricKey, target);
  }
  return `${block.action === 'add' ? 'Add' : 'Complete'} ${targetLabel} task${
    target > 1 || targetLabel.includes('-') ? 's' : ''
  }`;
}

// A reward drawn bare (no tile/badge chrome), matching how flies render in
// "worth" lines: gift boxes as the raw Rive, backgrounds as a small image.
export function BareRewardIcon({
  reward,
  rewardCatalog,
  isPremium,
  numberClassName,
  iconClassName,
  compact = false,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  numberClassName?: string;
  iconClassName?: string;
  compact?: boolean;
}) {
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
  const quantity = Math.max(1, reward.amount ?? 1);

  if (item?.slot === 'container') {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className={cn(
            '-my-1.5 shrink-0',
            compact ? 'h-8 w-8 -translate-y-[5px]' : 'h-11 w-11 -translate-y-[8px]',
            iconClassName,
          )}
        >
          <GiftRive
            className="h-full w-full"
            color={item.riveIndex}
            paused={false}
            animation="box_shake"
          />
        </span>
        <span
          className={cn(
            'translate-y-[2px] text-[13px] font-black tabular-nums text-foreground',
            numberClassName,
          )}
        >
          {quantity}
        </span>
      </span>
    );
  }

  if (item?.slot === 'background' && item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt={item.name}
        className="h-8 w-8 rounded-lg object-cover"
      />
    );
  }

  return (
    <RewardTile
      reward={reward}
      rewardCatalog={rewardCatalog}
      isPremium={isPremium}
      paused={true}
      hideBadge={quantity <= 1}
      className="h-8 w-8 rounded-lg"
    />
  );
}

// Total unclaimed loot in a quest, for "worth" teasers.
export function questLoot(quest: {
  logic: QuestCardLogicBlock[];
  claimedObjectiveIds?: string[];
}) {
  const claimed = quest.claimedObjectiveIds ?? [];
  const rewards = quest.logic
    .filter(
      (block) =>
        !claimed.includes(block.id) && (block.rewards?.length ?? 0) > 0,
    )
    .flatMap((block) => block.rewards ?? []);
  return {
    flies: rewards
      .filter((reward) => reward.type === 'FLIES')
      .reduce(
        (sum, reward) =>
          sum +
          Math.max(
            0,
            reward.amount ?? reward.maxAmount ?? reward.minAmount ?? 0,
          ),
        0,
      ),
    items: rewards.filter((reward) => reward.type !== 'FLIES'),
  };
}

export function formatQuestObjective(block: QuestCardLogicBlock) {
  const targetLabel =
    block.targetLabel ?? String(Math.max(0, block.target ?? 0));

  if (block.type === 'metric_count') {
    return metricObjectiveLabel(block.metricKey, Math.max(1, block.target ?? 1), {
      tagScoped: block.tagMode === 'focus_category_tags',
    });
  }

  if (block.type === 'focus_minutes') {
    return block.tagMode === 'focus_category_tags'
      ? `Focus for ${targetLabel} minutes on quest tasks`
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
      ? `quest ${subjectLabel}`
      : subjectLabel;
  return `${actionLabel} ${targetLabel} ${scopeLabel}`;
}

function renderFocusScopedMetricObjective(block: QuestCardLogicBlock) {
  if (block.metricKey === 'buddy_task_completed') {
    const target = Math.max(1, block.target ?? 1);
    return (
      <span>
        {target === 1
          ? 'Finish a task with your buddy'
          : `Finish ${target} tasks with your buddy`}
      </span>
    );
  }

  const streakMatch = block.metricKey
    ? TASK_STREAK_METRIC_PATTERN.exec(block.metricKey)
    : null;
  if (streakMatch) {
    const days = Number(streakMatch[1]);
    const target = Math.max(1, block.target ?? 1);
    return (
      <span>
        {target === 1
          ? `Reach a ${days}-day streak on a repeating task`
          : `Reach a ${days}-day streak on ${target} repeating tasks`}
      </span>
    );
  }

  return formatQuestObjective(block);
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
  const tags = context.linkedTags ?? [];
  if (
    block.type === 'metric_count' &&
    block.tagMode === 'focus_category_tags' &&
    tags.length > 0
  ) {
    return renderFocusScopedMetricObjective(block);
  }

  if (block.type === 'metric_count' || block.tagMode !== 'focus_category_tags') {
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

  if (tags.length > 0) {
    const suffix =
      isMinutes || !(numericTarget === 1 && !targetLabel.includes('-'))
        ? 'tasks'
        : 'task';
    return (
      <span>
        {isMinutes
          ? `${actionLabel} ${targetLabel} minutes on ${suffix}`
          : `${actionLabel} ${targetLabel} ${suffix}`}
      </span>
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

// Objective card wrapper that lets the progress bar visibly fill before the
// row flips to its finished styling (see useCompletionReveal).
function ObjectiveRevealCard({
  revealKey,
  complete,
  children,
}: {
  revealKey: string;
  complete: boolean;
  children: (suppressComplete: boolean) => React.ReactNode;
}) {
  const revealed = useCompletionReveal(revealKey, complete);
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-1 shadow-sm sm:px-4 transition-colors duration-300',
        objectiveCardTone(complete && revealed),
      )}
    >
      {children(complete && !revealed)}
    </div>
  );
}

export function StarterQuestCard({
  quest,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
  paused = false,
}: BaseCardProps & {
  quest: QuestCardData & { placement: 'onboarding' };
}) {
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const claimedObjectiveIds = quest.claimedObjectiveIds ?? [];
  const hiddenClaimedObjectiveIds = useHiddenClaimedObjectives(
    quest.id,
    claimedObjectiveIds,
  );
  const visibleLogic = quest.logic.filter(
    (block) => !hiddenClaimedObjectiveIds.has(block.id),
  );
  const isBlockDone = (block: QuestCardLogicBlock) => {
    const complete = block.progress >= Math.max(1, block.target);
    const hasRewards = (block.rewards?.length ?? 0) > 0;
    return claimedObjectiveIds.includes(block.id) || (complete && !hasRewards);
  };
  const isBlockClaimable = (block: QuestCardLogicBlock) =>
    block.progress >= Math.max(1, block.target) &&
    (block.rewards?.length ?? 0) > 0 &&
    !claimedObjectiveIds.includes(block.id);
  const totalSteps = quest.logic.length;
  const doneSteps = quest.logic.filter(isBlockDone).length;
  const shownBlocks = [...visibleLogic].sort(
    (a, b) => Number(isBlockClaimable(b)) - Number(isBlockClaimable(a)),
  );

  if (visibleLogic.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          <Sprout className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.75} />
          <span className="truncate">{quest.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-3.5 rounded-full',
                i < doneSteps ? 'bg-primary' : 'bg-primary/20',
              )}
            />
          ))}
          <span className="ml-1 text-[10px] font-black tabular-nums text-muted-foreground">
            {doneSteps}/{totalSteps}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {shownBlocks.map((block) => (
          <ObjectiveRevealCard
            key={block.id}
            revealKey={`${quest.id}:${block.id}`}
            complete={block.progress >= Math.max(1, block.target)}
          >
            {(suppressComplete) => (
              <ObjectiveRow
                block={block}
                objectiveClaimed={claimedObjectiveIds.includes(block.id)}
                claimingObjective={claimingObjectiveId === block.id}
                isPremium={isPremium}
                rewardCatalog={rewardCatalog}
                paused={true}
                suppressComplete={suppressComplete}
                onOpenRewards={(rewards) =>
                  setRewardPopup({ eyebrow: 'Objective', title: 'Rewards', rewards })
                }
                onClaimObjective={
                  onClaimObjective ? () => onClaimObjective(block.id) : undefined
                }
                isLast
                isFirst
              />
            )}
          </ObjectiveRevealCard>
        ))}
      </div>
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

export type DailyStreakInfo = {
  count: number;
  targetLength: number;
  todayComplete: boolean;
  claimable: boolean;
  rewards?: QuestReward[];
};

export function DailyChecklistCard({
  quests,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
  streak,
  claimingStreak = false,
  onClaimStreak,
  paused = false,
}: Omit<BaseCardProps, 'onClaimObjective'> & {
  quests: Array<QuestCardData & { placement: 'daily' }>;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
  streak?: DailyStreakInfo | null;
  claimingStreak?: boolean;
  onClaimStreak?: () => void;
}) {
  const timeLeft = useTimeLeft();
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const allDone = quests.every((quest) =>
    quest.logic.every((block) => {
      const complete = block.progress >= Math.max(1, block.target);
      const hasRewards = (block.rewards?.length ?? 0) > 0;
      const claimed = (quest.claimedObjectiveIds ?? []).includes(block.id);
      return claimed || (complete && !hasRewards);
    }),
  );

  return (
    <div data-quest-anchor={quests.map((quest) => quest.id).join(' ')}>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          <CalendarDays
            className="h-3.5 w-3.5 text-primary"
            strokeWidth={2.75}
          />
          Daily quests
        </span>
        {timeLeft ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            Resets in {timeLeft}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5">
        {allDone ? (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/50 bg-card px-4 py-5 text-center shadow-sm">
            <Check className="h-8 w-8 text-emerald-500" strokeWidth={3.5} />
            <p className="text-sm font-black text-foreground">
              All daily quests done!
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              New quests tomorrow.
            </p>
          </div>
        ) : (
          quests.map((quest) => (
            <DailyChecklistQuestRows
              key={quest.id}
              quest={quest}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              claimingObjectiveId={claimingObjectiveId}
              onOpenRewards={(rewards) =>
                setRewardPopup({
                  eyebrow: 'Objective',
                  title: 'Rewards',
                  rewards,
                })
              }
              onClaimObjective={onClaimObjective}
            />
          ))
        )}
        {streak ? (
          <DailyStreakStrip
            streak={streak}
            claiming={claimingStreak}
            onClaim={onClaimStreak}
            onShowPrizes={
              (streak.rewards?.length ?? 0) > 0
                ? () =>
                    setRewardPopup({
                      eyebrow: 'Daily streak',
                      title: 'Prize pool',
                      rewards: sortStreakPrizes(
                        streak.rewards ?? [],
                        rewardCatalog,
                      ),
                    })
                : undefined
            }
            rewardCatalog={rewardCatalog}
            isPremium={isPremium}
            paused={paused}
          />
        ) : null}
      </div>
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

const STREAK_PRIZE_RARITY_RANK: Record<string, number> = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

function streakPrizeRank(
  reward: QuestReward,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
  return item ? STREAK_PRIZE_RARITY_RANK[item.rarity] ?? 0 : 0;
}

function sortStreakPrizes(
  rewards: QuestReward[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  return [...rewards].sort(
    (a, b) =>
      streakPrizeRank(b, rewardCatalog) - streakPrizeRank(a, rewardCatalog),
  );
}

function DailyStreakStrip({
  streak,
  claiming = false,
  onClaim,
  onShowPrizes,
  rewardCatalog,
  isPremium,
  paused = false,
}: {
  streak: DailyStreakInfo;
  claiming?: boolean;
  onClaim?: () => void;
  onShowPrizes?: () => void;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused?: boolean;
}) {
  const length = Math.max(2, streak.targetLength);
  const cycleDay =
    streak.count === 0 ? 0 : ((streak.count - 1) % length) + 1;
  const prizePool = sortStreakPrizes(streak.rewards ?? [], rewardCatalog);
  const shownPrizes = prizePool.slice(0, 3);
  const extraPrizeCount = prizePool.length - shownPrizes.length;

  return (
    <div className="rounded-2xl border border-border/50 bg-card px-3 py-3 shadow-sm sm:px-4">
      <div className="flex items-center gap-2.5">
        {shownPrizes.length > 0 ? (
          <button
            type="button"
            onClick={onShowPrizes}
            disabled={!onShowPrizes}
            aria-label="See streak prizes"
            className="relative flex shrink-0 items-center py-1 disabled:pointer-events-none"
          >
            {shownPrizes.map((reward, i) => {
              const centerOffset = i - (shownPrizes.length - 1) / 2;
              return (
                <div
                  key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? reward.amount ?? i}`}
                  className="relative"
                  style={{
                    marginLeft: i === 0 ? 0 : -6,
                    transform: `rotate(${centerOffset * 7}deg) translateY(${Math.abs(centerOffset) * 3}px)`,
                    zIndex: shownPrizes.length - i,
                  }}
                >
                  <RewardTile
                    reward={reward}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                    compact
                    paused={paused}
                    hideBadge={reward.type !== 'FLIES'}
                    flySize={22}
                    hydrateDelayMs={150 + i * 100}
                    giftAnimation={i === 0 ? 'box_shake' : undefined}
                    className="h-10 w-10 shrink-0 rounded-xl ring-2 ring-card"
                  />
                </div>
              );
            })}
            {extraPrizeCount > 0 && (
              <span
                className="absolute rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground ring-2 ring-card"
                style={{ right: -6, bottom: 0, zIndex: shownPrizes.length + 1 }}
              >
                +{extraPrizeCount}
              </span>
            )}
          </button>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
            <Gift className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black leading-tight text-foreground">
            {streak.claimable
              ? 'Streak prize ready!'
              : `Daily streak · day ${cycleDay} of ${length}`}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {streak.claimable
              ? `You finished every daily quest ${length} days in a row`
              : streak.todayComplete
                ? 'Done for today — hop back tomorrow!'
                : `Finish all daily quests ${length - cycleDay} more day${length - cycleDay > 1 ? 's' : ''} to win${prizePool.length > 1 ? ` one of ${prizePool.length} prizes` : ''}`}
          </p>
        </div>
        {streak.claimable && onClaim ? (
          <span className={cn('inline-flex shrink-0', !claiming && 'claim-wobble')}>
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? 'Claiming...' : 'Claim'}
            </button>
          </span>
        ) : length <= 7 ? (
          <div className="flex shrink-0 items-center gap-1">
            {Array.from({ length }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 w-4 rounded-full',
                  i < cycleDay
                    ? 'bg-amber-400'
                    : 'border border-border/60 bg-muted',
                )}
              />
            ))}
          </div>
        ) : (
          <span className="shrink-0 text-[11px] font-black tabular-nums text-amber-600 dark:text-amber-400">
            {cycleDay}/{length}
          </span>
        )}
      </div>
    </div>
  );
}

export type MoveToWebInfo = {
  complete: boolean;
  claimable: boolean;
  reward: QuestReward;
  webUrl: string;
};

export function MoveToWebCard({
  moveToWeb,
  rewardCatalog,
  isPremium,
  claiming = false,
  onClaim,
  paused = false,
}: {
  moveToWeb: MoveToWebInfo;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claiming?: boolean;
  onClaim?: () => void;
  paused?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const host = moveToWeb.webUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(moveToWeb.webUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the URL is still shown */
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card px-3 py-3 shadow-sm sm:px-4">
      <div className="flex items-center gap-2.5">
        <RewardTile
          reward={moveToWeb.reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
          paused={paused}
          hideBadge={moveToWeb.reward.type !== 'FLIES'}
          flySize={22}
          giftAnimation="box_shake"
          className="h-10 w-10 shrink-0 rounded-xl ring-2 ring-card"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black leading-tight text-foreground">
            {moveToWeb.claimable
              ? 'Your reward is ready!'
              : 'Your pond works on computers too'}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {moveToWeb.claimable
              ? 'Thanks for hopping onto the web'
              : 'Log in on the web to unlock this prize'}
          </p>
        </div>
        {moveToWeb.claimable && onClaim ? (
          <span
            className={cn('inline-flex shrink-0', !claiming && 'claim-wobble')}
          >
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? 'Claiming...' : 'Claim'}
            </button>
          </span>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
            <Monitor className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </div>
        )}
      </div>
      {!moveToWeb.claimable && (
        <button
          type="button"
          onClick={() => void copyUrl()}
          aria-label={`Copy ${host}`}
          className="mt-2.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1 truncate text-[12px] font-black text-foreground">
            {host}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em]',
              copied ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={2.75} />
                Copy
              </>
            )}
          </span>
        </button>
      )}
    </div>
  );
}

function DailyChecklistQuestRows({
  quest,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onOpenRewards,
  onClaimObjective,
}: {
  quest: QuestCardData & { placement: 'daily' };
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claimingObjectiveId?: string | null;
  onOpenRewards: (rewards: QuestReward[]) => void;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
}) {
  const claimedObjectiveIds = quest.claimedObjectiveIds ?? [];
  const hiddenClaimedObjectiveIds = useHiddenClaimedObjectives(
    quest.id,
    claimedObjectiveIds,
  );
  const visibleLogic = quest.logic.filter(
    (block) => !hiddenClaimedObjectiveIds.has(block.id),
  );
  if (visibleLogic.length === 0) return null;

  return (
    <>
      {visibleLogic.map((block) => (
        <ObjectiveRevealCard
          key={block.id}
          revealKey={`${quest.id}:${block.id}`}
          complete={block.progress >= Math.max(1, block.target)}
        >
          {(suppressComplete) => (
            <ObjectiveRow
              block={block}
              objectiveClaimed={claimedObjectiveIds.includes(block.id)}
              claimingObjective={claimingObjectiveId === block.id}
              isPremium={isPremium}
              rewardCatalog={rewardCatalog}
              paused={true}
              suppressComplete={suppressComplete}
              onOpenRewards={onOpenRewards}
              onClaimObjective={
                onClaimObjective
                  ? () => onClaimObjective(quest.id, block.id)
                  : undefined
              }
              isLast
              isFirst
            />
          )}
        </ObjectiveRevealCard>
      ))}
    </>
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
  onStartQuest,
  onClaimObjective,
  locked = false,
  switchingFocus = false,
  activeFocusName,
  onActivateFocus,
  onUpgrade,
  canRent = false,
  rentedUntil,
  onRented,
  paused = false,
}: BaseCardProps & {
  quest: QuestCardData & {
    placement: 'category';
    categoryId: MacroCategoryDefinition['id'];
  };
  category?: MacroCategoryDefinition;
  linkedTags: QuestTagChip[];
  onEditTags?: () => void;
  onStartQuest?: () => void;
  locked?: boolean;
  switchingFocus?: boolean;
  activeFocusName?: string;
  onActivateFocus?: () => void;
  onUpgrade?: () => void;
  canRent?: boolean;
  rentedUntil?: string | null;
  onRented?: () => void;
}) {
  const heroImageUrl = category?.coverImageUrl ?? quest.coverImageUrl;
  const showWorthLabel = useMediaQuery('(min-width: 365px)');
  const timeLeft = useCountdownLabel(quest.expiresAt);
  const rentedTimeLeft = useCountdownLabel(rentedUntil ?? undefined);
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [showAllObjectives, setShowAllObjectives] = useState(false);
  // Close the confirm once a switch finishes (switchingFocus flips back off).
  useEffect(() => {
    if (!switchingFocus) setShowSwitch(false);
  }, [switchingFocus]);
  useEffect(() => {
    setShowAllObjectives(false);
  }, [quest.id]);
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

  const isBlockDone = (block: QuestCardLogicBlock) => {
    const complete = block.progress >= Math.max(1, block.target);
    const hasRewards = (block.rewards?.length ?? 0) > 0;
    return claimedObjectiveIds.includes(block.id) || (complete && !hasRewards);
  };
  const isBlockClaimable = (block: QuestCardLogicBlock) =>
    block.progress >= Math.max(1, block.target) &&
    (block.rewards?.length ?? 0) > 0 &&
    !claimedObjectiveIds.includes(block.id);
  const totalSteps = quest.logic.length;
  const doneSteps = quest.logic.filter(isBlockDone).length;
  const orderedOpen = [...visibleLogic].sort(
    (a, b) => Number(isBlockClaimable(b)) - Number(isBlockClaimable(a)),
  );
  const shownBlocks = showAllObjectives ? orderedOpen : orderedOpen.slice(0, 2);
  const foldedBlocks = showAllObjectives ? [] : orderedOpen.slice(2);
  const foldedRewards = foldedBlocks.flatMap((block) => block.rewards ?? []);
  const foldedFlies = foldedRewards
    .filter((reward) => reward.type === 'FLIES')
    .reduce(
      (sum, reward) =>
        sum +
        Math.max(0, reward.amount ?? reward.maxAmount ?? reward.minAmount ?? 0),
      0,
    );
  const foldedItems = foldedRewards
    .filter((reward) => reward.type !== 'FLIES')
    .slice(0, 2);

  const showObjectives = !isCompleted && !needsFocusTags;

  const heroPriority = scoreQuestPriority({
    placement: 'category',
    progress: quest.logic.reduce(
      (sum, block) =>
        sum + Math.min(Math.max(0, block.progress), Math.max(1, block.target)),
      0,
    ),
    target: quest.logic.reduce(
      (sum, block) => sum + Math.max(1, block.target),
      0,
    ),
    lastProgressAt: quest.lastProgressAt,
    expiresAt: quest.expiresAt,
  });
  const resetAtRisk =
    !isCompleted &&
    !needsFocusTags &&
    heroPriority.hoursUntilReset !== null &&
    heroPriority.hoursUntilReset < 6 &&
    heroPriority.proximity < 0.5;

  return (
    <div
      className={cn(
        showObjectives &&
          'rounded-[22px] border border-border/40 bg-card/60 p-2 shadow-sm dark:bg-card/40',
      )}
    >
      <div
        className={cn(
          'overflow-hidden border border-border/50 bg-card shadow-sm',
          showObjectives ? 'rounded-2xl' : 'rounded-[24px]',
        )}
      >
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
        {locked && !isCompleted && (
          <button
            type="button"
            onClick={() => setShowSwitch(true)}
            className="group absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center transition-colors [@media(hover:hover)]:hover:bg-black/55"
            aria-label="Switch quest"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.12em] text-slate-900 shadow-[0_4px_0_0_rgba(15,23,42,0.25)] ring-1 ring-black/10 backdrop-blur-sm transition active:translate-y-[2px] active:shadow-none group-active:translate-y-[2px] dark:bg-card/95 dark:text-card-foreground dark:ring-white/10">
              <Repeat className="h-4 w-4" strokeWidth={2.75} />
              Switch quest
            </span>
            <span className="text-[12px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              Tap to switch to this quest
            </span>
          </button>
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
          {rentedTimeLeft && !isCompleted ? (
            <button
              type="button"
              onClick={onUpgrade}
              title="Keep every area running with Plus"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-900 shadow-[0_2px_0_rgba(15,23,42,0.25)] transition active:scale-95"
            >
              <Clock className="h-3 w-3" strokeWidth={3} />
              {rentedTimeLeft} left
            </button>
          ) : null}
          {timeLeft && !isCompleted ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 text-[13px] uppercase leading-none tracking-wide drop-shadow-[0_2px_0_rgba(15,23,42,0.85)]',
                resetAtRisk ? 'text-amber-300' : 'text-white',
              )}
              style={{
                fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                WebkitTextStroke: '1.4px rgba(15, 23, 42, 0.9)',
                paintOrder: 'stroke fill',
              }}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
              <span className="leading-none">Resets in {timeLeft}</span>
            </span>
          ) : null}
        </div>

        {needsFocusTags && !locked && !isCompleted && (
          <button
            type="button"
            onClick={onStartQuest ?? onEditTags}
            className="absolute inset-0 z-20"
            aria-label="Start quest"
            data-hint="start-focus-quest"
          />
        )}
      </div>

      {/* Not started yet: the art stays fully visible; the CTA lives below it. */}
      {needsFocusTags && !locked && !isCompleted && (
        <button
          type="button"
          onClick={onStartQuest ?? onEditTags}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          data-hint="start-focus-quest"
        >
          <span className="min-w-0 flex-1 text-[13px] font-black leading-snug text-foreground">
            Get rewarded for {category?.name ?? 'these'} tasks
          </span>
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#4f9149] px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#34631f] transition-all active:translate-y-[2px] active:shadow-none">
            <Play className="h-3.5 w-3.5 fill-current" />
            Start quest
          </span>
        </button>
      )}

      {/* Banner footer: which tag counts + overall progress pips. */}
      {!isCompleted && !needsFocusTags && (
        <div className="px-4 pb-3 pt-2.5">
          {usesFocusTags && !locked && linkedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Counting tasks tagged
              </span>
              {linkedTags.map((tag) =>
                onEditTags ? (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={onEditTags}
                    aria-label={`Change the ${tag.name} tag`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-sm transition active:scale-95 [@media(hover:hover)]:hover:opacity-80"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      borderColor: `${tag.color}40`,
                      color: tag.color,
                    }}
                  >
                    <span className="truncate">{tag.name}</span>
                    <Pencil
                      className="h-3 w-3 shrink-0 opacity-70"
                      strokeWidth={2.75}
                    />
                  </button>
                ) : (
                  <QuestTagPill key={tag.id} tag={tag} />
                ),
              )}
            </div>
          )}
          {totalSteps > 1 && (
            <div
              className={cn(
                'flex items-center gap-1',
                usesFocusTags && !locked && linkedTags.length > 0 && 'mt-2',
              )}
            >
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-4 rounded-full',
                    i < doneSteps ? 'bg-lime-500' : 'bg-muted',
                  )}
                />
              ))}
              <span className="ml-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                {doneSteps} / {totalSteps} done
              </span>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Objectives float below the banner, matching the daily/starter rows. */}
      {!isCompleted && !needsFocusTags && (
        <div
          className={cn(
            'mt-2 flex flex-col gap-2',
            locked && 'pointer-events-none select-none opacity-50 saturate-50',
          )}
        >
        {shownBlocks.map((block) => (
          <ObjectiveRevealCard
            key={block.id}
            revealKey={`${quest.id}:${block.id}`}
            complete={block.progress >= Math.max(1, block.target)}
          >
            {(suppressComplete) => (
              <>
            <ObjectiveRow
              block={block}
              objectiveClaimed={claimedObjectiveIds.includes(block.id)}
              claimingObjective={claimingObjectiveId === block.id}
              isPremium={isPremium}
              rewardCatalog={rewardCatalog}
              paused={true}
              suppressComplete={suppressComplete}
              onOpenRewards={(rewards) =>
                setRewardPopup({
                  eyebrow: 'Objective',
                  title: 'Rewards',
                  rewards,
                })
              }
              onClaimObjective={
                locked || !onClaimObjective
                  ? undefined
                  : () => onClaimObjective(block.id)
              }
              isLast
              isFirst
              linkedTags={linkedTags}
              categoryName={category?.shortLabel || category?.name}
              categoryAccent={category?.accent}
              onPickTags={onEditTags}
              forceDimmed={needsFocusTags}
            />
            {block.tagMode !== 'focus_category_tags' &&
            getTagScopeMessage(block) ? (
              <p className="px-1 mb-2 -mt-2 text-xs font-medium text-muted-foreground">
                {getTagScopeMessage(block)}
              </p>
            ) : null}
            {block.tagMode !== 'focus_category_tags' && (
              <div className="flex flex-wrap items-center gap-2 -mt-1.5 mb-2 px-1">
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
              </>
            )}
          </ObjectiveRevealCard>
        ))}
        {(foldedBlocks.length > 0 ||
          (showAllObjectives && orderedOpen.length > 2)) && (
          <button
            type="button"
            onClick={() => setShowAllObjectives((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/30 px-3 py-2.5 text-[clamp(0.625rem,calc(0.375rem_+_1.25vw),0.6875rem)] font-black uppercase tracking-[0.1em] text-muted-foreground transition hover:bg-muted/60 sm:px-4"
          >
            <span className="shrink-0">
              {showAllObjectives
                ? 'Show less'
                : `Show ${foldedBlocks.length} more`}
            </span>
            {!showAllObjectives &&
              (foldedFlies > 0 || foldedItems.length > 0) && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 normal-case tracking-normal">
                  {showWorthLabel && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/80">
                      worth
                    </span>
                  )}
                  {foldedFlies > 0 && (
                    <FlyWorth
                      amount={foldedFlies}
                      numberClassName="translate-y-0 text-[clamp(0.6875rem,calc(0.1875rem_+_2.5vw),0.8125rem)]"
                      iconClassName="-translate-y-[2px]"
                    />
                  )}
                  {foldedItems.map((reward, index) => (
                    <BareRewardIcon
                      key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? index}`}
                      reward={reward}
                      rewardCatalog={rewardCatalog}
                      isPremium={isPremium}
                      numberClassName="translate-y-0 text-[clamp(0.6875rem,calc(0.1875rem_+_2.5vw),0.8125rem)]"
                      iconClassName="-translate-y-[10px]"
                    />
                  ))}
                </span>
              )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform',
                showAllObjectives && 'rotate-180',
                (showAllObjectives ||
                  (foldedFlies <= 0 && foldedItems.length === 0)) &&
                  'ml-auto',
              )}
              strokeWidth={3}
            />
          </button>
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
      />
      <SwitchFocusConfirm
        open={showSwitch}
        categoryId={quest.categoryId}
        categoryName={category?.shortLabel || category?.name}
        coverImageUrl={heroImageUrl}
        currentFocusName={activeFocusName}
        switching={switchingFocus}
        onConfirm={() => onActivateFocus?.()}
        onUpgrade={onUpgrade}
        canRent={canRent}
        onRented={onRented}
        onClose={() => setShowSwitch(false)}
      />
    </div>
  );
}

// Shown before unlinking or swapping away a quest's original tag: progress
// from that tag stops counting, so make sure that's what the user wants.
export function RemoveTagConfirm({
  open,
  mode = 'remove',
  categoryName,
  onConfirm,
  onClose,
}: {
  open: boolean;
  mode?: 'remove' | 'switch';
  categoryName?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const switching = mode === 'switch';
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1610}
      className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 text-card-foreground sm:px-6 sm:pb-6 sm:pt-3"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500">
            <TriangleAlert className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h3 className="text-center text-xl font-black text-foreground">
            {switching
              ? 'Switch this quest’s tag?'
              : 'Remove this quest’s tag?'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
            {switching ? (
              <>
                The{' '}
                <span className="font-bold text-foreground">
                  {categoryName ?? 'area'}
                </span>{' '}
                quest recounts from the new tag. Claimed rewards stay yours.
              </>
            ) : (
              <>
                The{' '}
                <span className="font-bold text-foreground">
                  {categoryName ?? 'area'}
                </span>{' '}
                quest pauses until you link a tag again. Claimed rewards stay
                yours.
              </>
            )}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="h-12 rounded-2xl bg-muted text-[14px] font-black text-foreground transition hover:bg-muted/80"
            >
              {switching ? 'Switch tag' : 'Remove tag'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-primary text-[14px] font-black uppercase tracking-wide text-primary-foreground transition active:translate-y-[2px]"
            >
              {switching ? 'Keep current' : 'Keep tag'}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

export function SwitchFocusConfirm({
  open,
  categoryId,
  categoryName,
  coverImageUrl,
  currentFocusName,
  switching = false,
  onConfirm,
  onUpgrade,
  canRent = false,
  onRented,
  onClose,
}: {
  open: boolean;
  categoryId?: string;
  categoryName?: string;
  coverImageUrl?: string;
  currentFocusName?: string;
  switching?: boolean;
  onConfirm: () => void;
  onUpgrade?: () => void;
  canRent?: boolean;
  onRented?: () => void;
  onClose: () => void;
}) {
  const [rentBusy, setRentBusy] = useState(false);
  const [rentError, setRentError] = useState<string | null>(null);
  const rentAvailable = canRent && !!categoryId && rewardedAdsAvailable();

  useEffect(() => {
    if (!open) {
      setRentBusy(false);
      setRentError(null);
    }
  }, [open]);

  const handleRent = async () => {
    if (rentBusy || !categoryId) return;
    setRentBusy(true);
    setRentError(null);
    try {
      const adResult = await showRewardedAd('focus_rental');
      if (adResult !== 'rewarded') {
        if (adResult === 'failed') {
          setRentError('Ad not available right now — try again in a moment.');
        }
        return;
      }
      const res = await fetch('/api/quests/rent-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ categoryId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.granted) {
        setRentError(payload.error ?? 'Could not unlock — try again.');
        return;
      }
      if (payload.unlocked) {
        hapticSuccess();
        onRented?.();
        onClose();
      }
    } finally {
      setRentBusy(false);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1200}
      className="sm:max-w-[400px]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 text-card-foreground sm:px-6 sm:pb-6 sm:pt-3"
        >
          {coverImageUrl ? (
            <div className="relative mb-4 mt-4 h-24 overflow-hidden rounded-2xl sm:mt-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt={categoryName ?? 'Quest'}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              {categoryName ? (
                <span
                  className="absolute bottom-2 left-3 text-[19px] uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                  style={{
                    fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                    WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                    paintOrder: 'stroke fill',
                  }}
                >
                  {categoryName}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500">
              <Repeat className="h-7 w-7" strokeWidth={2.5} />
            </div>
          )}
              <h3 className="text-center text-xl font-black text-foreground">
                {rentAvailable
                  ? `Run the ${categoryName ?? 'this area'} quest too?`
                  : 'Switch your quest?'}
              </h3>
              {rentAvailable ? (
                <p className="mx-auto mt-1.5 max-w-[19rem] text-center text-[14px] leading-snug text-muted-foreground">
                  Keep your{' '}
                  <span className="font-bold text-foreground">
                    {currentFocusName ?? 'current'}
                  </span>{' '}
                  quest going and run the{' '}
                  <span className="font-bold text-foreground">
                    {categoryName ?? 'this area'}
                  </span>{' '}
                  quest alongside it.
                </p>
              ) : (
                <p className="mx-auto mt-1.5 max-w-[19rem] text-center text-[14px] leading-snug text-muted-foreground">
                  Switching to{' '}
                  <span className="font-bold text-foreground">
                    {categoryName ?? 'this focus'}
                  </span>{' '}
                  quest resets your{' '}
                  <span className="font-bold text-foreground">
                    {currentFocusName ?? 'current'}
                  </span>{' '}
                  quest progress.
                </p>
              )}
              <div className="mt-5 flex flex-col gap-4">
                {!rentAvailable && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={switching}
                    className="h-12 w-full rounded-2xl bg-primary text-[14px] font-black uppercase tracking-wide text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {switching ? 'Switching...' : 'Switch quest'}
                  </button>
                )}
                {rentAvailable && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={handleRent}
                      disabled={rentBusy}
                      className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-amber-500 text-white shadow-[0_4px_0_0_#b45309] ring-1 ring-[#b45309]/40 transition-all [@media(hover:hover)]:hover:bg-amber-400 active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.11em]">
                        <Play className="h-3.5 w-3.5 fill-current" />
                        {rentBusy ? (
                          'Loading...'
                        ) : (
                          <>
                            Progress both
                            <span className="relative inline-flex shrink-0 items-center overflow-hidden rounded-lg bg-white/25 px-2 py-1 text-[11px] font-black leading-none tracking-[0.08em] text-white ring-1 ring-white/30">
                              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shine" />
                              24 hours
                            </span>
                          </>
                        )}
                      </span>
                      {!rentBusy && (
                        <span className="text-[11px] font-bold normal-case tracking-normal text-white/90">
                          Watch a short ad — both quests run for 24 hours
                        </span>
                      )}
                    </button>
                    {rentError && (
                      <p className="text-center text-[12px] font-bold text-red-500">
                        {rentError}
                      </p>
                    )}
                  </div>
                )}
                {onUpgrade && rentAvailable && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={onUpgrade}
                      aria-label="Progress all quests with Frog Plus"
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-amber-200/90 bg-amber-50 text-[13px] font-black uppercase tracking-[0.11em] text-amber-700 transition active:scale-[0.98] dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      <Icon
                        name="frogPlus"
                        className="pointer-events-none -my-4 h-10 w-10 shrink-0 drop-shadow-[0_2px_0_rgba(31,98,28,0.3)]"
                      />
                      Progress all quests
                      <span className="inline-flex shrink-0 items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[11px] font-black uppercase leading-none tracking-normal text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
                        Plus
                      </span>
                    </button>
                    <p className="text-center text-[11px] font-medium text-muted-foreground">
                      Every area, always — with double rewards and unlimited
                      tags.
                    </p>
                  </div>
                )}
                {onUpgrade && !rentAvailable && (
                  <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={onUpgrade}
                    aria-label="Progress all quests with Frog Plus"
                    className="group relative isolate flex h-14 w-full items-center justify-center gap-0 rounded-2xl px-2 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98] min-[375px]:gap-2"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent"
                    />
                    <Icon
                      name="frogPlus"
                      className="pointer-events-none absolute left-1 h-16 w-16 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)] min-[375px]:static min-[375px]:-my-6 min-[375px]:-ml-1 min-[375px]:shrink-0"
                    />
                    <span className="flex w-full items-center justify-center gap-2 pl-12 min-[375px]:w-auto min-[375px]:pl-0">
                      <span className="whitespace-nowrap text-[14px] font-black uppercase tracking-normal text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                        Progress all quests
                      </span>
                      <span className="inline-flex shrink-0 items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-normal text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                        Plus
                      </span>
                    </span>
                  </button>
                  <p className="whitespace-nowrap text-center text-[11px] font-medium text-muted-foreground">
                    Finish multiple focus quests at the same time.
                  </p>
                  </div>
                )}
                {rentAvailable && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={switching}
                    className="mx-auto pt-1 text-[12px] font-bold text-muted-foreground underline decoration-border underline-offset-4 transition hover:text-foreground disabled:opacity-60"
                  >
                    {switching
                      ? 'Switching...'
                      : `Or switch quests instead — resets ${currentFocusName ?? 'current'} progress`}
                  </button>
                )}
              </div>
        </div>
      )}
    </BaseSheet>
  );
}

export type AreaRowState = 'running' | 'paused' | 'start';

// One compact row per non-expanded area: art thumb, name, and the loot still
// waiting inside — plus what tapping it does (start / switch / view).
export function AreaRow({
  quest,
  category,
  state,
  finished = false,
  linkedTags = [],
  rewardCatalog,
  isPremium,
  onPress,
  rentedUntil,
}: {
  quest: QuestCardData & {
    placement: 'category';
    categoryId: MacroCategoryDefinition['id'];
  };
  category?: MacroCategoryDefinition;
  state: AreaRowState;
  finished?: boolean;
  linkedTags?: QuestTagChip[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onPress?: () => void;
  rentedUntil?: string | null;
}) {
  const rentedTimeLeft = useCountdownLabel(rentedUntil ?? undefined);
  const atLeast380 = useMediaQuery('(min-width: 380px)');
  const atLeast640 = useMediaQuery('(min-width: 640px)');
  const atLeast820 = useMediaQuery('(min-width: 820px)');
  const thumbWidthClass = atLeast640 ? 'w-[88px]' : atLeast380 ? 'w-[72px]' : 'w-14';
  const claimedObjectiveIds = quest.claimedObjectiveIds ?? [];
  const imageUrl = category?.coverImageUrl ?? quest.coverImageUrl;
  const totalTarget = quest.logic.reduce(
    (sum, block) => sum + Math.max(1, block.target),
    0,
  );
  const totalProgress = quest.logic.reduce(
    (sum, block) =>
      sum + Math.min(Math.max(0, block.progress), Math.max(1, block.target)),
    0,
  );
  const pct =
    totalTarget > 0 ? Math.round((totalProgress / totalTarget) * 100) : 0;

  const loot = questLoot(quest);
  const lootTiles = loot.items.slice(0, 2);
  const lootExtra = loot.items.length - lootTiles.length;
  const nextBlock = quest.logic.find(
    (block) =>
      !claimedObjectiveIds.includes(block.id) &&
      block.progress < Math.max(1, block.target),
  );
  const priority = scoreQuestPriority({
    placement: 'category',
    progress: totalProgress,
    target: totalTarget,
    lastProgressAt: quest.lastProgressAt,
    expiresAt: quest.expiresAt,
  });
  const quiet =
    state === 'running' && !finished && priority.reason === 'neglected';
  const resetLabel =
    state === 'running' && !finished
      ? resetCountdownLabel(priority.hoursUntilReset)
      : null;

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[20px] border bg-card p-3 text-left shadow-sm transition active:scale-[0.98] sm:gap-3',
        quest.claimable && !finished
          ? 'border-amber-400 ring-1 ring-amber-400/40'
          : 'border-border/50',
        finished && 'opacity-70',
      )}
    >
      <div
        className={cn(
          'relative h-14 shrink-0 overflow-hidden rounded-xl',
          thumbWidthClass,
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={category?.name ?? quest.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${category?.backgroundFrom ?? '#0f172a'}, ${category?.backgroundTo ?? '#1e293b'})`,
            }}
          />
        )}
        {finished && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Check className="h-6 w-6 text-emerald-300" strokeWidth={3.5} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-black text-foreground">
            {category?.name ?? quest.title}
          </span>
          {quiet ? (
            <span
              title={`No progress for ${priority.staleDays} days`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400"
            >
              <Moon className="h-2.5 w-2.5" strokeWidth={3} />
              {priority.staleDays}d
            </span>
          ) : null}
          {resetLabel ? (
            <span
              className={cn(
                'ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-black uppercase tracking-wide',
                priority.hoursUntilReset !== null &&
                  priority.hoursUntilReset < 6
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={3} />
              {resetLabel}
            </span>
          ) : null}
        </p>
        {state === 'running' && !finished && linkedTags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {linkedTags.map((tag) => (
              <QuestTagPill key={tag.id} tag={tag} compact />
            ))}
          </div>
        ) : null}
        {state === 'running' && !finished ? (
          <>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'absolute inset-y-[1.5px] left-[1.5px] rounded-full',
                    quest.claimable ? 'bg-lime-500' : 'bg-amber-400',
                  )}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </div>
            {nextBlock ? (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  Next: {shortObjectiveLabel(nextBlock)} ·{' '}
                  <span className="tabular-nums">
                    {Math.min(
                      nextBlock.progress,
                      Math.max(1, nextBlock.target),
                    )}
                    /{nextBlock.targetLabel ?? nextBlock.target}
                  </span>
                </span>
                {nextBlock.rewards?.[0] ? (
                  nextBlock.rewards[0].type === 'FLIES' ? (
                    <FlyWorth
                      amount={Math.max(
                        0,
                        nextBlock.rewards[0].amount ??
                          nextBlock.rewards[0].maxAmount ??
                          nextBlock.rewards[0].minAmount ??
                          0,
                      )}
                      flySize={20}
                    />
                  ) : (
                    <BareRewardIcon
                      reward={nextBlock.rewards[0]}
                      rewardCatalog={rewardCatalog}
                      isPremium={isPremium}
                    />
                  )
                ) : null}
              </p>
            ) : null}
          </>
        ) : !finished && (loot.flies > 0 || lootTiles.length > 0) ? (
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            {atLeast820 && (
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/80">
                worth
              </span>
            )}
            {loot.flies > 0 && <FlyWorth amount={loot.flies} flySize={20} />}
            {lootTiles.map((reward, index) => (
              <BareRewardIcon
                key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? index}`}
                reward={reward}
                rewardCatalog={rewardCatalog}
                isPremium={isPremium}
                compact
              />
            ))}
            {lootExtra > 0 && (
              <span className="text-[10px] font-black text-muted-foreground">
                +{lootExtra}
              </span>
            )}
          </span>
        ) : finished ? (
          <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
            Done — refreshes soon
          </p>
        ) : null}
      </div>

      <div className="shrink-0">
        {finished ? (
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            Done
          </span>
        ) : quest.claimable ? (
          <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-600 dark:text-amber-400">
            <Gift className="h-3.5 w-3.5" strokeWidth={2.75} />
            Ready
          </span>
        ) : state === 'start' ? (
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all active:translate-y-[2px] active:shadow-none">
            <Play className="h-3.5 w-3.5 fill-current" />
            Start
          </span>
        ) : state === 'paused' ? (
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all active:translate-y-[2px] active:shadow-none">
            <Play className="h-3.5 w-3.5 fill-current" />
            Start
          </span>
        ) : rentedTimeLeft ? (
          <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-600 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
            {rentedTimeLeft}
          </span>
        ) : (
          <span className="pr-1 text-muted-foreground">
            <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

// Big art-forward pick card for the "nothing started yet" chooser: full-bleed
// cover, the area name in the display font, the loot on offer, and one loud
// Start button.
export function AreaStartCard({
  quest,
  category,
  compact = false,
  rewardCatalog,
  isPremium,
  onPress,
}: {
  quest: QuestCardData & {
    placement: 'category';
    categoryId: MacroCategoryDefinition['id'];
  };
  category?: MacroCategoryDefinition;
  /** Half-width grid variant for users with many areas. */
  compact?: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onPress?: () => void;
}) {
  const imageUrl = category?.coverImageUrl ?? quest.coverImageUrl;
  const loot = questLoot(quest);
  const lootTiles = loot.items.slice(0, compact ? 1 : 2);
  const lootExtra = loot.items.length - lootTiles.length;

  const ctaChip = (
    <span
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all active:translate-y-[2px] active:shadow-none',
        compact ? 'w-full' : 'shrink-0 px-4',
      )}
    >
      <Play className="h-3.5 w-3.5 fill-current" />
      Start
    </span>
  );

  const worth = (loot.flies > 0 || lootTiles.length > 0) && (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/80">
        worth
      </span>
      {loot.flies > 0 && <FlyWorth amount={loot.flies} />}
      {lootTiles.map((reward, index) => (
        <BareRewardIcon
          key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? index}`}
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
        />
      ))}
      {lootExtra > 0 && (
        <span className="text-[10px] font-black text-muted-foreground">
          +{lootExtra}
        </span>
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onPress}
      className="h-full w-full overflow-hidden rounded-[24px] border border-border/50 bg-card text-left shadow-sm transition active:scale-[0.98] [@media(hover:hover)]:hover:shadow-md"
    >
      <div
        className={cn(
          'relative w-full overflow-hidden',
          compact ? 'h-20' : 'h-28',
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={category?.name ?? quest.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${category?.backgroundFrom ?? '#0f172a'}, ${category?.backgroundTo ?? '#1e293b'})`,
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />
        <span
          className={cn(
            'absolute bottom-2 uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]',
            compact
              ? 'left-3 right-3 truncate text-[15px]'
              : 'left-3.5 text-[20px]',
          )}
          style={{
            fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
            WebkitTextStroke: compact
              ? '1.4px rgba(15, 23, 42, 0.95)'
              : '1.8px rgba(15, 23, 42, 0.95)',
            paintOrder: 'stroke fill',
          }}
        >
          {category?.name ?? quest.title}
        </span>
      </div>
      {compact ? (
        <div className="flex flex-col gap-2 px-3 py-2.5">
          {worth}
          {ctaChip}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {worth || <span />}
          {ctaChip}
        </div>
      )}
    </button>
  );
}

// Matches the season banner palette: amber while in progress, lime when done.
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
  forceDimmed = false,
  suppressComplete = false,
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
  forceDimmed?: boolean;
  suppressComplete?: boolean;
}) {
  const safeTarget = Math.max(1, block.target);
  const objectiveComplete = !suppressComplete && block.progress >= safeTarget;
  const hasRewards = (block.rewards?.length ?? 0) > 0;
  const objectiveClaimable =
    hasRewards && objectiveComplete && !objectiveClaimed;
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const guideId = guideIdForBlock(block);

  const stepDone = objectiveClaimed || (objectiveComplete && !hasRewards);
  const needsTag =
    forceDimmed ||
    (block.tagMode === 'focus_category_tags' &&
      (linkedTags?.length ?? 0) === 0);

  const renderActionSlot = () => {
    if (objectiveClaimable && onClaimObjective) {
      return (
        <span
          className={cn(
            'inline-flex animate-[reward-pop_0.45s_ease-out_both] motion-reduce:animate-none',
            !claimingObjective && 'claim-wobble',
          )}
        >
          <button
            type="button"
            onClick={onClaimObjective}
            disabled={claimingObjective}
            data-hint="claim-objective"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-500 px-3.5 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 min-[400px]:px-4"
          >
            {claimingObjective ? 'Claiming...' : 'Claim'}
          </button>
        </span>
      );
    }
    if (stepDone) {
      return (
        <div className="flex h-8 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2.5 animate-[reward-pop_0.45s_ease-out_both] motion-reduce:animate-none">
          <Check className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600/70 dark:text-emerald-400/70">
            {objectiveClaimed ? 'Claimed' : 'Done'}
          </span>
        </div>
      );
    }
    return (
      <HintButton
        text={objectiveHintText(block, linkedTags?.[0]?.name, {
          omitTagScope: block.tagMode === 'focus_category_tags',
        })}
        tags={
          block.tagMode === 'focus_category_tags' ? linkedTags : undefined
        }
        onShowMe={
          guideId && !needsTag
            ? () => {
                const context = guideContextForBlock(block);
                const tagNames =
                  context?.tagNames ??
                  (linkedTags?.length
                    ? linkedTags.map((tag) => tag.name)
                    : undefined);
                const chipSource = linkedTags?.length
                  ? linkedTags
                  : undefined;
                startHintGuide(guideId, {
                  ...context,
                  tagNames,
                  tags:
                    chipSource?.filter((tag) =>
                      tagNames ? tagNames.includes(tag.name) : true,
                    ) ?? undefined,
                });
              }
            : undefined
        }
      />
    );
  };

  const objectiveRewards = hasRewards
    ? sortStreakPrizes(block.rewards!, rewardCatalog)
    : [];
  const shownRewards = objectiveRewards.slice(0, 3);
  const extraRewardCount = objectiveRewards.length - shownRewards.length;

  return (
    <div
      className={cn(
        'py-2.5 transition-opacity',
        !isLast && 'border-b border-border/20',
        needsTag && 'opacity-50 saturate-50',
      )}
      aria-disabled={needsTag || undefined}
    >
      <div className="flex items-center gap-2 sm:gap-2.5">
        {shownRewards.length > 0 ? (
          <button
            type="button"
            onClick={() => onOpenRewards?.(objectiveRewards)}
            aria-label="See objective rewards"
            className="relative flex shrink-0 cursor-pointer items-center py-1"
          >
            {shownRewards.map((reward, i) => {
              const centerOffset = i - (shownRewards.length - 1) / 2;
              return (
                <div
                  key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? reward.amount ?? i}`}
                  className="relative"
                  style={{
                    marginLeft: i === 0 ? 0 : -6,
                    transform:
                      shownRewards.length > 1
                        ? `rotate(${centerOffset * 7}deg) translateY(${Math.abs(centerOffset) * 3}px)`
                        : undefined,
                    zIndex: shownRewards.length - i,
                  }}
                >
                  <RewardTile
                    reward={reward}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium ?? false}
                    compact
                    paused={paused}
                    className={cn(
                      'h-11 w-11 rounded-xl min-[400px]:h-12 min-[400px]:w-12',
                      shownRewards.length > 1 && 'ring-2 ring-card',
                    )}
                    hydrateDelayMs={150 + i * 100}
                    giftAnimation={i === 0 ? 'box_shake' : undefined}
                  />
                </div>
              );
            })}
            {extraRewardCount > 0 && (
              <span
                className="pointer-events-none absolute z-30 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-white/10 bg-black/55 px-1 text-[9px] font-black uppercase tracking-wide text-white shadow-sm backdrop-blur-sm"
                style={{ right: -6, bottom: 0 }}
              >
                +{extraRewardCount}
              </span>
            )}
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[clamp(0.75rem,calc(0.125rem_+_3.125vw),0.875rem)] font-black leading-snug',
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

          <ObjectiveProgressBar
            className="mt-1.5"
            progress={block.progress}
            target={block.target}
            targetLabel={block.targetLabel}
            complete={objectiveComplete || (objectiveClaimed ?? false)}
          />
        </div>

        <div className="shrink-0">{renderActionSlot()}</div>
      </div>
    </div>
  );
}

function QuestTagPill({
  tag,
  compact = false,
}: {
  tag: QuestTagChip;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex max-w-full items-center justify-center gap-1.5 border font-black uppercase tracking-wider shadow-sm',
        compact
          ? 'rounded-lg px-2 py-0.5 text-[10px]'
          : 'rounded-xl px-3 py-1.5 text-[11px]',
      )}
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
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;

  if (item?.slot === 'background') {
    return (
      <div className="relative flex flex-col overflow-hidden rounded-2xl border-[3px] border-emerald-500 bg-emerald-50 p-2.5 text-center shadow-emerald-500/15 dark:bg-emerald-950/30">
        <div className="relative mx-auto mt-4 mb-2 flex aspect-[1/0.75] w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-900/40 dark:to-emerald-950/40">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
        </div>
        <p className="pb-1 text-xs font-bold leading-tight text-foreground">
          {item.name}
        </p>
      </div>
    );
  }

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
    slot: item.slot as ItemDef['slot'],
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
  giftAnimation,
  frogClassName,
  flySize,
  flyOversample,
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
  /** Optional gift-box animation override (e.g. 'box_shake'). */
  giftAnimation?: string;
  /** Optional class override for the frog cosmetic preview (e.g. a translate). */
  frogClassName?: string;
  /** Optional size override for the fly reward icon. */
  flySize?: number;
  /** Backing-resolution headroom for flies shown inside scale animations. */
  flyOversample?: number;
}) {
  const { ref, hasHydrated } = useDelayedHydration<HTMLDivElement>(
    hydrateDelayMs,
  );
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
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
            size={flySize ?? (compact ? 30 : 22)}
            y={-1}
            paused={paused}
            interactive={false}
            oversample={flyOversample}
          />
        </div>
      ) : item?.slot === 'background' ? (
        <div className="absolute inset-0 z-10 overflow-hidden rounded-[inherit]">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <RewardTileGloss />
          )}
        </div>
      ) : item?.slot === 'container' && hasHydrated ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className={cn(
              compact
                ? 'h-[118%] w-[118%] drop-shadow-lg'
                : 'h-[120%] w-[120%]',
              giftAnimation && '-translate-y-1.5',
            )}
          >
            <GiftRive className="w-full h-full" color={item.riveIndex} paused={false} animation={giftAnimation} />
          </div>
        </div>
      ) : previewIndices && hasHydrated ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Frog
            className={cn(
              'object-contain',
              compact
                ? 'h-[118%] w-[118%] -translate-y-[18%]'
                : 'h-[120%] w-[120%] translate-y-[8%]',
              frogClassName,
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
      <div className="absolute inset-y-[-24%] left-0 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-90 animate-[shine_1.35s_ease-in-out_2_both] dark:via-current dark:opacity-20" />
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
  const id = reward.itemId ?? reward.backgroundId;
  if (id) {
    return rewardCatalog[id]?.name ?? id;
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
