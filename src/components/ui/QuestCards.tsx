'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clock,
  Copy,
  Gift,
  Lock,
  Monitor,
  RefreshCw,
  Sparkles,
  Sprout,
  Star,
  TriangleAlert,
  Trophy,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasRewardQuantityBadge } from '@/lib/quests/rewardQuantity';
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
import { FrogSnapshot } from './FrogSnapshot';
import { Icon } from './Icon';
import { GiftRive } from './gift-box/GiftBox';
import { ItemCard } from './skins/ItemCard';
import { BaseSheet } from '@/components/ui/BaseSheet';
import {
  HintButton,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  objectiveCardTone,
  rewardStackTileStyle,
  useCompletionReveal,
} from '@/lib/questClaims';
import { QuestTrack } from './QuestTrack';
import { guideContextForBlock, guideIdForBlock } from '@/lib/hints/guides';
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
  | 'sessionMinutes'
  | 'requiresFollowThrough'
  | 'beforeHour'
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
  expiresAt?: string;
  lastProgressAt?: string;
  logic: QuestCardLogicBlock[];
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  claimedObjectiveIds?: string[];
  carriedTiers?: number;
  rerollsLeft?: number;
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
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900 dark:to-emerald-950',
    shadow: 'shadow-emerald-900/10',
  },
  rare: {
    border: 'border-sky-400',
    bg: 'bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900 dark:to-sky-950',
    shadow: 'shadow-sky-900/10',
  },
  epic: {
    border: 'border-violet-400',
    bg: 'bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-900 dark:to-violet-950',
    shadow: 'shadow-violet-900/20',
  },
  legendary: {
    border: 'border-amber-400',
    bg: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900 dark:to-amber-950',
    shadow: 'shadow-amber-900/30',
  },
  flies: {
    border: 'border-emerald-500',
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900 dark:to-emerald-950',
    shadow: 'shadow-emerald-900/10',
  },
  default: {
    border: 'border-border/40',
    bg: 'bg-muted',
    shadow: 'shadow-sm',
  },
};


function lightTileTone(tone: { border: string; bg: string; shadow: string }) {
  const light = (classes: string) =>
    classes
      .split(' ')
      .filter((name) => !name.startsWith('dark:'))
      .join(' ')
      .replace('bg-muted', 'bg-white')
      .replace('border-border/40', 'border-white/70');
  return { border: light(tone.border), bg: light(tone.bg), shadow: light(tone.shadow) };
}

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
    return metricObjectiveLabel(block.metricKey, Math.max(1, block.target ?? 1));
  }

  if (block.type === 'focus_minutes') {
    return `Focus ${targetLabel} minutes`;
  }

  if (block.type === 'distinct_days') {
    const days = Math.max(1, block.target ?? 1) === 1 ? 'day' : 'days';
    return `Show up ${targetLabel} ${days}`;
  }

  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    return Math.max(1, block.target ?? 1) === 1
      ? `Focus ${minutes} min in one sitting`
      : `${targetLabel} focus sessions of ${minutes} min`;
  }

  if (block.type === 'day_parts') {
    const parts = Math.min(3, Math.max(1, block.target ?? 1));
    if (parts === 1) return 'Finish a task today';
    if (parts >= 3) return 'Finish tasks morning, noon and night';
    return 'Finish tasks in 2 parts of the day';
  }

  const numericTarget = Math.max(0, block.target ?? 0);
  const subjectLabel =
    block.subject === 'any'
      ? 'tasks'
      : numericTarget === 1 && !targetLabel.includes('-')
        ? 'task'
        : 'tasks';

  const scopeLabel = subjectLabel;
  if (block.action === 'add') {
    const addTarget =
      block.targetLabel ?? (numericTarget === 1 ? 'a' : String(numericTarget));
    return block.requiresFollowThrough
      ? `Plan and finish ${targetLabel} ${scopeLabel}`
      : `Add ${addTarget} ${scopeLabel} of your own`;
  }
  if (typeof block.beforeHour === 'number') {
    return `Finish ${targetLabel} ${scopeLabel} ${questHourCutoffLabel(block.beforeHour)}`;
  }
  return `Finish ${targetLabel} ${scopeLabel}`;
}

export function questHourCutoffLabel(hour: number): string {
  if (hour === 12) return 'before noon';
  if (hour < 12) return `before ${hour}am`;
  return `before ${hour - 12}pm`;
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
  const totalSteps = quest.logic.length;
  const doneSteps = quest.logic.filter(isBlockDone).length;
  const shownBlocks = visibleLogic
    .filter(
      (block) => (block.rewards?.length ?? 0) > 0 || !isBlockDone(block),
    )
    .slice(0, 1);

  if (shownBlocks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-black text-muted-foreground">
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

/** A Lily Pad and a guaranteed-rarity draw have no catalog id, so the roll
 * tables carry two outcomes the plain reward type cannot describe. */
export type SweepRewardInfo =
  | QuestReward
  | { type: 'SHIELD'; amount?: number }
  | { type: 'RARITY_ITEM'; rarity: string; amount?: number; itemId?: string };

export type SweepRollEntryInfo = {
  id: string;
  chance: number;
  reward: SweepRewardInfo;
};

export type DailySweepInfo = {
  count: number;
  todayComplete: boolean;
  objectivesDone: number;
  objectivesTotal: number;
  cleanSweepFlies: number;
  cleanSweepPaidToday: boolean;
  pendingRolls: number;
  claimable: boolean;
  nextTier: 'standard' | 'golden';
  nextMega: boolean;
  nextRollDayKey?: string | null;
  sweepsToGolden: number;
  goldenEveryDays: number;
  megaEveryDays: number;
  standardRoll: SweepRollEntryInfo[];
  goldenRoll: SweepRollEntryInfo[];
  megaRewards: SweepRewardInfo[];
};

export function DailyChecklistCard({
  quests,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
  sweep,
  claimingSweep = false,
  onClaimSweep,
  paused = false,
  swapsLeft = 0,
  swapping = false,
  onSwapQuests,
}: Omit<BaseCardProps, 'onClaimObjective'> & {
  quests: Array<QuestCardData & { placement: 'daily' }>;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
  sweep?: DailySweepInfo | null;
  claimingSweep?: boolean;
  onClaimSweep?: () => void;
  swapsLeft?: number;
  swapping?: boolean;
  onSwapQuests?: () => void;
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

  const openCount = quests.reduce(
    (sum, quest) =>
      sum +
      quest.logic.filter((block) => {
        const complete = block.progress >= Math.max(1, block.target);
        const claimed = (quest.claimedObjectiveIds ?? []).includes(block.id);
        return !claimed && !complete;
      }).length,
    0,
  );

  return (
    <div data-quest-anchor={quests.map((quest) => quest.id).join(' ')}>
      <QuestSectionHeader
        title="Today’s quests"
        count={allDone ? 'All done' : openCount > 0 ? `${openCount} left` : undefined}
        right={
          <>
            {onSwapQuests && swapsLeft > 0 && !allDone ? (
              <button
                type="button"
                onClick={onSwapQuests}
                disabled={swapping}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5 shrink-0', swapping && 'animate-spin')}
                  strokeWidth={2.75}
                />
                {swapping ? 'Swapping' : 'Swap'}
              </button>
            ) : null}
            {timeLeft ? (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-black tabular-nums text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
                {timeLeft}
              </span>
            ) : null}
          </>
        }
      />

      <div className={QUEST_CARD_CLASS}>
        {allDone ? (
          <div className="flex items-center gap-3 px-3.5 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/[0.14] text-primary ring-1 ring-inset ring-primary/25">
              <Check className="h-5 w-5" strokeWidth={3.5} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black text-foreground">
                All three done
              </span>
              <span className="block text-[12.5px] font-semibold text-muted-foreground">
                New quests land tomorrow morning
              </span>
            </span>
          </div>
        ) : (
          quests.map((quest, questIndex) => (
            <DailyChecklistQuestRows
              key={quest.id}
              quest={quest}
              firstQuest={questIndex === 0}
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
        {sweep ? (
          <>
            <div className="border-t border-border/50">
              <CleanSweepCard
                bare
                sweep={sweep}
                claiming={claimingSweep}
                onClaim={onClaimSweep}
                rewardCatalog={rewardCatalog}
                isPremium={isPremium}
                paused={paused}
              />
            </div>
            {sweep.goldenEveryDays > 0 && sweep.goldenRoll.length > 0 ? (
              <div className="border-t border-border/50">
                <SweepStreakCard
                  bare
                  sweep={sweep}
                  rewardCatalog={rewardCatalog}
                  isPremium={isPremium}
                  paused={paused}
                />
              </div>
            ) : null}
          </>
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

export const QUEST_CARD_CLASS =
  'overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)]';

export function QuestSectionHeader({
  title,
  count,
  right,
  icon,
}: {
  title: string;
  count?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 pb-1.5 pl-3.5 pr-1">
      <span className="flex min-w-0 items-baseline gap-2">
        {icon && <span className="self-center">{icon}</span>}
        <span className="truncate text-[19px] font-black tracking-tight text-foreground">
          {title}
        </span>
        {count && (
          <span className="shrink-0 text-[14px] font-bold text-muted-foreground">
            {count}
          </span>
        )}
      </span>
      {right && <span className="flex shrink-0 items-center gap-1.5">{right}</span>}
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
  // A Lily Pad costs 350 flies in the shop — between a Rare and a Legendary
  // gift, which is where it belongs when a lane fans two prizes.
  if (reward.type === 'SHIELD') return 2.5;
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
  return item ? STREAK_PRIZE_RARITY_RANK[item.rarity] ?? 0 : 0;
}

export function sortStreakPrizes(
  rewards: QuestReward[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  return [...rewards].sort(
    (a, b) =>
      streakPrizeRank(b, rewardCatalog) - streakPrizeRank(a, rewardCatalog),
  );
}

// Gradients rather than tints, and fully opaque in dark mode: an alpha fill
// lets the card show through and reads as a placeholder next to a real tile.
const SWEEP_RARITY_TONE: Record<string, string> = {
  legendary:
    'border-amber-400 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 dark:from-amber-900 dark:to-amber-950 dark:text-amber-300',
  epic: 'border-violet-400 bg-gradient-to-br from-violet-100 to-violet-50 text-violet-700 dark:from-violet-900 dark:to-violet-950 dark:text-violet-300',
  rare: 'border-sky-400 bg-gradient-to-br from-sky-100 to-sky-50 text-sky-700 dark:from-sky-900 dark:to-sky-950 dark:text-sky-300',
  uncommon:
    'border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 dark:from-emerald-900 dark:to-emerald-950 dark:text-emerald-300',
  common:
    'border-slate-300 bg-gradient-to-br from-slate-200 to-slate-100 text-slate-600 dark:border-slate-600 dark:from-slate-800 dark:to-slate-900 dark:text-slate-300',
};

function isCatalogReward(reward: SweepRewardInfo): reward is QuestReward {
  return (
    reward.type === 'FLIES' ||
    reward.type === 'ITEM' ||
    reward.type === 'BOX' ||
    reward.type === 'BACKGROUND'
  );
}

export function sweepRewardLabel(
  reward: SweepRewardInfo,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium = false,
) {
  if (reward.type === 'SHIELD') {
    const amount = Math.max(1, (reward as { amount?: number }).amount ?? 1);
    return amount > 1 ? `${amount} Lily Pads` : 'Lily Pad';
  }
  if (reward.type === 'RARITY_ITEM') {
    const { rarity, itemId } = reward as { rarity: string; itemId?: string };
    const name = itemId ? rewardCatalog[itemId]?.name : undefined;
    return name ?? `Guaranteed ${rarity} outfit`;
  }
  return rewardLabel(reward, rewardCatalog, isPremium);
}

/** One outcome's art: catalog rewards reuse the shared tile, the two
 * catalog-less outcomes get their own. */
export function SweepRewardTile({
  reward,
  rewardCatalog,
  isPremium,
  paused = false,
  className,
  flySize,
  flyOversample,
  frogClassName,
  giftAnimation,
  hideBadge,
}: {
  reward: SweepRewardInfo;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused?: boolean;
  className?: string;
  flySize?: number;
  flyOversample?: number;
  frogClassName?: string;
  giftAnimation?: string;
  hideBadge?: boolean;
}) {
  const pinnedItemId =
    reward.type === 'RARITY_ITEM'
      ? (reward as { itemId?: string }).itemId
      : undefined;
  // RewardTile's default sits the frog 8% low, which crops its feet in a row
  // this size. Lifted and scaled up a little so the outfit is what you see.
  const frogPreviewClass = frogClassName ?? 'h-[132%] w-[132%] -translate-y-[14%]';
  if (isCatalogReward(reward) || pinnedItemId) {
    return (
      <RewardTile
        reward={
          pinnedItemId
            ? { type: 'ITEM', itemId: pinnedItemId }
            : (reward as QuestReward)
        }
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        paused={paused}
        hideBadge={hideBadge ?? reward.type !== 'FLIES'}
        flySize={flySize}
        flyOversample={flyOversample}
        frogClassName={frogPreviewClass}
        giftAnimation={giftAnimation}
        className={className}
      />
    );
  }

  if (reward.type === 'SHIELD') {
    return (
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 shadow-sm dark:from-emerald-900 dark:to-emerald-950 dark:text-emerald-300',
          className,
        )}
      >
        <Icon name="lilyPad" label="Lily Pad" className="h-6 w-6" />
      </div>
    );
  }

  const rarity = (reward as { rarity: string }).rarity;
  return (
    <div
      className={cn(
        'flex h-12 w-12 flex-col items-center justify-center rounded-xl border-2 shadow-sm',
        SWEEP_RARITY_TONE[rarity] ?? SWEEP_RARITY_TONE.common,
        className,
      )}
    >
      <Sparkles className="h-4 w-4" strokeWidth={2.75} />
      <span className="mt-0.5 text-[10px] font-black leading-none tracking-wide">
        {rarity.slice(0, 4)}
      </span>
    </div>
  );
}

/**
 * How good an outcome looks on a card, so a stack of three leads with the
 * prizes worth chasing. A guaranteed-rarity draw scores below everything: it is
 * the one outcome with no item to picture, so it belongs in the "+N" rather
 * than taking a slot with a placeholder tile.
 */
function sweepEntryRank(
  entry: SweepRollEntryInfo,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  const reward = entry.reward;
  if (reward.type === 'RARITY_ITEM') {
    const { itemId, rarity } = reward as { itemId?: string; rarity: string };
    if (!itemId) return -1;
    return STREAK_PRIZE_RARITY_RANK[rewardCatalog[itemId]?.rarity ?? rarity] ?? 4;
  }
  // A Lily Pad costs 350 flies in the shop — between a Rare and a Legendary
  // gift, which is where it belongs in a stack of three.
  if (reward.type === 'SHIELD') return 2.5;
  if (reward.type === 'FLIES') {
    const amount = (reward as QuestReward).amount ?? 0;
    return Math.min(3, amount / 40);
  }
  const lookupId =
    (reward as QuestReward).itemId ?? (reward as QuestReward).backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
  return item ? STREAK_PRIZE_RARITY_RANK[item.rarity] ?? 1 : 1;
}

/** The three best outcomes to show, and how many the "+N" stands for. */
function sweepPrizeStack(
  table: SweepRollEntryInfo[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  const ranked = [...table]
    .map((entry) => ({ entry, rank: sweepEntryRank(entry, rewardCatalog) }))
    .sort((a, b) => b.rank - a.rank);
  const shown = ranked
    .filter((row) => row.rank >= 0)
    .slice(0, 3)
    .map((row) => row.entry);
  return { shown, extra: Math.max(0, table.length - shown.length) };
}

/** A quantity chip per tile, same as the Leap's stack. */
function sweepQuantityLabel(reward: SweepRewardInfo) {
  if (reward.type === 'FLIES') {
    return String(Math.max(0, (reward as QuestReward).amount ?? 0));
  }
  const amount = Math.max(1, (reward as { amount?: number }).amount ?? 1);
  return `\u00d7${amount}`;
}

/**
 * Laid out like the Leap's reward badge (QuestRewardTileBadge): fanned by a few
 * degrees, overlapping, quantity chip per tile, and the "+N" tucked into the
 * bottom-right corner of the whole stack instead of sitting beside it.
 */
function SweepPrizeStack({
  table,
  rewardCatalog,
  isPremium,
  onOpen,
  label,
  paused = false,
}: {
  table: SweepRollEntryInfo[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onOpen: () => void;
  label: string;
  paused?: boolean;
}) {
  const { shown, extra } = sweepPrizeStack(table, rewardCatalog);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="relative my-0.5 flex shrink-0 items-center py-1"
    >
      {shown.map((entry, i) => {
        return (
          <div
            key={entry.id || i}
            className="relative"
            style={rewardStackTileStyle(i, shown.length)}
          >
            <SweepRewardTile
              reward={entry.reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              paused={paused}
              hideBadge
              frogClassName="-translate-y-[18%]"
              flySize={30}
              flyOversample={1.25}
              giftAnimation={i === 0 ? 'box_shake' : undefined}
              className="h-11 w-11 rounded-xl min-[400px]:h-12 min-[400px]:w-12"
            />
            {hasRewardQuantityBadge(entry.reward) && (
              <span className="absolute -right-1 -top-1 z-20 flex min-w-5 items-center justify-center rounded-md border border-white/10 bg-black/55 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white shadow-sm backdrop-blur-sm">
                {sweepQuantityLabel(entry.reward)}
              </span>
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <span className="pointer-events-none absolute -bottom-0.5 -right-1.5 z-30 flex h-4 min-w-4 items-center justify-center rounded-md border border-white/10 bg-black/55 px-1 text-[10px] font-black tracking-wide text-white shadow-sm backdrop-blur-sm">
          +{extra}
        </span>
      )}
    </button>
  );
}

function SweepOddsPopup({
  open,
  sweep,
  initialTab,
  rewardCatalog,
  isPremium,
  onClose,
  paused = false,
}: {
  open: boolean;
  sweep: DailySweepInfo;
  initialTab: 'standard' | 'golden';
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onClose: () => void;
  paused?: boolean;
}) {
  const [tab, setTab] = useState<'standard' | 'golden'>(initialTab);
  // The popup stays mounted between opens, so the tab follows whichever table
  // the caller cares about each time it is reopened.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const table = tab === 'golden' ? sweep.goldenRoll : sweep.standardRoll;
  const total = table.reduce((sum, entry) => sum + Math.max(0, entry.chance), 0) || 1;

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[24px] border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <p className="text-[13px] font-black text-muted-foreground">
              Daily prizes
            </p>
            <h3 className="mt-1 text-2xl font-black leading-none text-foreground">
              What you can win
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-background/80 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close reward roll odds"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-1.5 rounded-xl bg-muted/60 p-1">
          {(['standard', 'golden'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-[13px] font-black tracking-wide transition',
                tab === key
                  ? key === 'golden'
                    ? 'bg-amber-400 text-amber-950 shadow-sm'
                    : 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {key === 'golden' ? 'Golden' : 'Every day'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-bold leading-tight text-muted-foreground">
          {tab === 'golden'
            ? `Finish all daily quests ${sweep.goldenEveryDays} days in a row to win from here.`
            : 'Win one of these each day you finish all daily quests.'}
        </p>

        <div className="mt-3 divide-y divide-border/40">
          {table.map((entry, index) => (
            <div key={entry.id || index} className="flex items-center gap-3 py-2">
              <SweepRewardTile
                reward={entry.reward}
                rewardCatalog={rewardCatalog}
                isPremium={isPremium}
                paused={paused}
                flySize={34}
                flyOversample={1.25}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">
                {sweepRewardLabel(entry.reward, rewardCatalog, isPremium)}
              </span>
              <span className="shrink-0 text-[13px] font-black tabular-nums text-muted-foreground">
                {formatChance((100 * Math.max(0, entry.chance)) / total)}%
              </span>
            </div>
          ))}
        </div>

        {sweep.megaEveryDays > 0 && sweep.megaRewards.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-400/50 bg-amber-50 px-3 py-3 dark:bg-amber-500/10">
            <p className="text-[13px] font-black tracking-wide text-amber-700 dark:text-amber-300">
              Every {sweep.megaEveryDays} days in a row
            </p>
            <p className="mt-0.5 text-[12px] font-bold text-foreground">
              A guaranteed gift on top of the golden prize.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {sweep.megaRewards.map((reward, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <SweepRewardTile
                    reward={reward}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                    paused={paused}
                    flySize={34}
                    flyOversample={1.25}
                  />
                  <span className="text-[12px] font-bold text-foreground">
                    {sweepRewardLabel(reward, rewardCatalog, isPremium)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function formatChance(value: number) {
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

/**
 * The day's payoff moment: the three quests pay their own flies, finishing all
 * three pays the Clean Sweep bonus and earns one Reward Roll, and every Nth
 * consecutive sweep day upgrades that roll to the golden table.
 */
/**
 * Today's payoff, and only today's: the three quests pay their own flies, and
 * finishing all three pays the Clean Sweep bonus plus one Reward Roll. Which
 * table that roll uses is the streak's business, not this row's — mixing the
 * two put a multi-day ladder and a same-day checklist in one sentence.
 */
function CleanSweepCard({
  sweep,
  claiming = false,
  onClaim,
  rewardCatalog,
  isPremium,
  paused = false,
  bare = false,
}: {
  sweep: DailySweepInfo;
  claiming?: boolean;
  onClaim?: () => void;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused?: boolean;
  bare?: boolean;
}) {
  const [oddsOpen, setOddsOpen] = useState(false);
  const golden = sweep.nextTier === 'golden';
  const remaining = Math.max(0, sweep.objectivesTotal - sweep.objectivesDone);
  const total = Math.max(1, sweep.objectivesTotal);

  return (
    <div
      className={
        bare
          ? 'px-3.5 py-3.5'
          : 'rounded-2xl border border-border/50 bg-card px-3.5 py-4 shadow-sm sm:px-4'
      }
    >
      <div className="flex items-center gap-3.5">
        <SweepPrizeStack
          table={golden ? sweep.goldenRoll : sweep.standardRoll}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          onOpen={() => setOddsOpen(true)}
          label="See what you can win"
          paused={paused}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black leading-tight text-foreground">
            {sweep.claimable
              ? sweep.nextMega
                ? 'Your mega prize is ready'
                : golden
                  ? 'Your golden prize is ready'
                  : 'Your daily prize is ready'
              : sweep.todayComplete
                ? 'All daily quests done'
                : remaining === 1
                  ? '1 daily quest left'
                  : 'Finish all daily quests'}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {sweep.claimable
              ? sweep.nextMega
                ? 'Golden odds + a guaranteed gift'
                : golden
                  ? 'Better odds of rare outfits'
                  : 'A surprise prize inside'
              : sweep.todayComplete
                ? 'New quests tomorrow'
                : `Win ${sweep.cleanSweepFlies} flies + a surprise prize`}
          </p>
        </div>

        {sweep.claimable && onClaim ? (
          <span className={cn('inline-flex shrink-0', !claiming && 'claim-wobble')}>
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-xl px-4 text-[13px] font-black text-white transition-all hover:translate-y-[-1px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60',
                golden
                  ? 'bg-amber-500 shadow-[0_3px_0_0_#b45309] hover:shadow-[0_4px_0_0_#b45309]'
                  : 'bg-[#447d3f] shadow-[0_3px_0_0_#2c511a] hover:shadow-[0_4px_0_0_#2c511a]',
              )}
            >
              {claiming
                ? 'Opening…'
                : sweep.pendingRolls > 1
                  ? `Open (${sweep.pendingRolls})`
                  : 'Open'}
            </button>
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 w-4 rounded-full',
                  i < sweep.objectivesDone
                    ? 'bg-emerald-500'
                    : 'border border-border/60 bg-muted',
                )}
              />
            ))}
          </div>
        )}
      </div>

      <SweepOddsPopup
        open={oddsOpen}
        sweep={sweep}
        initialTab={sweep.nextTier}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setOddsOpen(false)}
        paused={paused}
      />
    </div>
  );
}

/**
 * The multi-day half, kept in its own row: consecutive sweep days, and what
 * they upgrade the roll to. Nothing here is actionable today — it exists to
 * show why tomorrow's sweep is worth more than today's.
 */
function SweepStreakCard({
  sweep,
  rewardCatalog,
  isPremium,
  paused = false,
  bare = false,
}: {
  sweep: DailySweepInfo;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused?: boolean;
  bare?: boolean;
}) {
  const [oddsOpen, setOddsOpen] = useState(false);
  const every = Math.max(1, sweep.goldenEveryDays);
  const cycleDay = Math.max(0, Math.min(every, every - sweep.sweepsToGolden));
  const goldenNext = sweep.sweepsToGolden <= 1;
  const megaNext =
    sweep.megaEveryDays > 0 &&
    (sweep.count + 1) % sweep.megaEveryDays === 0;

  return (
    <div
      className={cn(
        bare
          ? 'px-3.5 py-3.5'
          : 'rounded-2xl border px-3.5 py-4 shadow-sm sm:px-4',
        goldenNext
          ? cn(
              'bg-gradient-to-br from-amber-50 to-card dark:from-amber-500/10',
              !bare && 'border-amber-400/70',
            )
          : cn('bg-card', !bare && 'border-border/50'),
      )}
    >
      <div className="flex items-center gap-3.5">
        <SweepPrizeStack
          table={sweep.goldenRoll}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          onOpen={() => setOddsOpen(true)}
          label="See the golden prizes"
          paused={paused}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black leading-tight text-foreground">
            {megaNext
              ? 'Mega prize next'
              : goldenNext
                ? 'Golden prize next'
                : `Golden prize in ${sweep.sweepsToGolden} days`}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {goldenNext
              ? 'Finish all daily quests to win it'
              : sweep.count === 0
                ? `Finish all daily quests ${every} days in a row`
                : 'Finish all daily quests every day'}
          </p>
        </div>

        {every <= 7 ? (
          <div className="flex shrink-0 items-center gap-1" aria-hidden>
            {Array.from({ length: every }, (_, i) =>
              i === every - 1 ? (
                <Star
                  key={i}
                  className={cn(
                    'h-4 w-4',
                    i < cycleDay
                      ? 'fill-amber-400 text-amber-500'
                      : 'fill-amber-100 text-amber-400 dark:fill-amber-500/20',
                  )}
                  strokeWidth={2.5}
                />
              ) : (
                <span
                  key={i}
                  className={cn(
                    'h-2 w-4 rounded-full',
                    i < cycleDay
                      ? 'bg-amber-400'
                      : 'border border-border/60 bg-muted',
                  )}
                />
              ),
            )}
          </div>
        ) : (
          <span className="shrink-0 text-[11px] font-black tabular-nums text-amber-600 dark:text-amber-400">
            {cycleDay}/{every}
          </span>
        )}
      </div>

      <SweepOddsPopup
        open={oddsOpen}
        sweep={sweep}
        initialTab="golden"
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setOddsOpen(false)}
        paused={paused}
      />
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
  const [rewardPopupOpen, setRewardPopupOpen] = useState(false);
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
      <div className="flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => setRewardPopupOpen(true)}
          aria-label="See quest reward"
          className="relative flex shrink-0 cursor-pointer items-center py-1"
        >
          <RewardTile
            reward={moveToWeb.reward}
            rewardCatalog={rewardCatalog}
            isPremium={isPremium}
            compact
            paused={paused}
            hideBadge={moveToWeb.reward.type !== 'FLIES'}
            flySize={22}
            giftAnimation="box_shake"
            className="h-11 w-11 rounded-xl min-[400px]:h-12 min-[400px]:w-12"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black leading-tight text-foreground">
            {moveToWeb.claimable
              ? 'Your reward is ready!'
              : 'Plan your week on the big screen'}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-muted-foreground">
            {moveToWeb.claimable
              ? 'Thanks for hopping onto the web'
              : 'Log in on your computer once to unlock this prize'}
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
              'inline-flex shrink-0 items-center gap-1 text-[12px] font-black',
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
      <RewardDetailsPopup
        open={rewardPopupOpen}
        eyebrow="Web quest"
        title="Reward"
        rewards={[moveToWeb.reward]}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setRewardPopupOpen(false)}
        paused={paused}
      />
    </div>
  );
}

function DailyChecklistQuestRows({
  quest,
  firstQuest = false,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onOpenRewards,
  onClaimObjective,
}: {
  quest: QuestCardData & { placement: 'daily' };
  firstQuest?: boolean;
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
      {visibleLogic.map((block, i) => (
        <QuestObjectiveRow
          key={block.id}
          block={block}
          divider={!(firstQuest && i === 0)}
          claimed={claimedObjectiveIds.includes(block.id)}
          claiming={claimingObjectiveId === block.id}
          isPremium={isPremium}
          rewardCatalog={rewardCatalog}
          onOpenRewards={onOpenRewards}
          onClaim={
            onClaimObjective
              ? () => onClaimObjective(quest.id, block.id)
              : undefined
          }
        />
      ))}
    </>
  );
}

type JourneyItem =
  | {
      kind: 'step';
      key: string;
      questId: string;
      block: QuestCardLogicBlock;
      claimed: boolean;
      done: boolean;
    }
  | {
      kind: 'gate';
      key: string;
      title: string;
      detail: string;
      unlocked: boolean;
      stepsAway: number;
      icon: React.ReactNode;
    };

function isObjectiveDone(block: QuestCardLogicBlock, claimedIds: string[]) {
  const complete = block.progress >= Math.max(1, block.target);
  const hasRewards = (block.rewards?.length ?? 0) > 0;
  return claimedIds.includes(block.id) || (complete && !hasRewards);
}

function rewardHint(rewards: QuestReward[] | undefined) {
  const flies = (rewards ?? [])
    .filter((reward) => reward.type === 'FLIES')
    .reduce((sum, reward) => sum + (reward.amount ?? 0), 0);
  return flies > 0 ? flies : null;
}

export function JourneyCard({
  quests,
  earlyObjectiveSteps,
  unlockTarget,
  dailyGated,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
}: {
  quests: QuestCardData[];
  earlyObjectiveSteps: number;
  unlockTarget: number;
  dailyGated: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claimingObjectiveId?: string | null;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
}) {
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const steps: Extract<JourneyItem, { kind: 'step' }>[] = [];
  for (const quest of quests) {
    const claimedIds = quest.claimedObjectiveIds ?? [];
    for (const block of quest.logic) {
      steps.push({
        kind: 'step',
        key: `${quest.id}:${block.id}`,
        questId: quest.id,
        block,
        claimed: claimedIds.includes(block.id),
        done: isObjectiveDone(block, claimedIds),
      });
    }
  }
  if (steps.length === 0) return null;

  const doneInPath = steps.filter((step) => step.done).length;
  const stepsBefore = Math.max(0, earlyObjectiveSteps - doneInPath);
  const currentIndex = steps.findIndex((step) => !step.done);
  const items: JourneyItem[] = [];
  const dailyGateAfter = dailyGated
    ? Math.min(steps.length - 1, Math.max(0, unlockTarget - stepsBefore - 1))
    : -1;
  const dailyStepsAway = Math.max(0, unlockTarget - earlyObjectiveSteps);

  steps.forEach((step, index) => {
    items.push(step);
    if (index === dailyGateAfter) {
      items.push({
        kind: 'gate',
        key: 'gate-daily',
        title: 'Daily quests unlock',
        detail: '3 new quests daily + a prize',
        unlocked: false,
        stepsAway: dailyStepsAway,
        icon: <Icon name="quests" className="h-6 w-6" />,
      });
    }
  });

  const reachedAt = items.map((item) =>
    item.kind === 'step'
      ? item.done || steps.indexOf(item) === currentIndex
      : items
          .slice(0, items.indexOf(item))
          .every((it) => it.kind === 'gate' || it.done),
  );

  return (
    <div>
      <QuestSectionHeader
        title="Your journey"
        count={`${doneInPath} of ${steps.length}`}
      />
      <div className={QUEST_CARD_CLASS}>
        <ol className="py-1.5">
          {items.map((item, index) => {
            const first = index === 0;
            const last = index === items.length - 1;
            const lineDone = reachedAt[index];
            const nextDone = reachedAt[index + 1] ?? false;
            if (item.kind === 'gate') {
              return (
                <li key={item.key} className="relative flex gap-3 pl-3.5 pr-3">
                  <JourneyRail first={first} last={last} done={lineDone} nextDone={nextDone}>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-amber-600 ring-2 ring-card dark:bg-amber-500/15">
                      <Lock className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </JourneyRail>
                  <div className="my-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-dashed border-amber-400/60 bg-amber-50/70 px-3 py-2.5 dark:bg-amber-500/10">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-black leading-tight text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    {item.stepsAway > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500 px-2 py-1 text-[11px] font-black leading-none text-white shadow-[0_2px_0_0_#b45309]">
                        {item.stepsAway === 1 ? '1 step' : `${item.stepsAway} steps`}
                      </span>
                    )}
                  </div>
                </li>
              );
            }
            const stepIndex = steps.indexOf(item);
            const current = stepIndex === currentIndex;
            const flies = rewardHint(item.block.rewards);
            return (
              <li key={item.key} className="relative flex gap-3 pl-3.5 pr-3">
                <JourneyRail first={first} last={last} done={lineDone} nextDone={nextDone}>
                  {item.done ? (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#4f9149] text-white ring-2 ring-card">
                      <Check className="h-4 w-4" strokeWidth={3.5} />
                    </span>
                  ) : current ? (
                    <span className="relative grid h-8 w-8 place-items-center rounded-full bg-card text-[13px] font-black text-primary ring-2 ring-primary">
                      <span className="journey-pulse absolute inset-0 rounded-full ring-2 ring-primary/50" />
                      {stepIndex + 1}
                    </span>
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-[13px] font-black text-muted-foreground ring-2 ring-card">
                      {stepIndex + 1}
                    </span>
                  )}
                </JourneyRail>
                {current ? (
                  <QuestObjectiveRow
                    block={item.block}
                    divider={false}
                    claimed={item.claimed}
                    claiming={claimingObjectiveId === item.block.id}
                    isPremium={isPremium}
                    rewardCatalog={rewardCatalog}
                    onOpenRewards={(rewards) =>
                      setRewardPopup({ eyebrow: 'Step', title: 'Rewards', rewards })
                    }
                    onClaim={
                      onClaimObjective
                        ? () => onClaimObjective(item.questId, item.block.id)
                        : undefined
                    }
                    className="my-1 flex-1 rounded-2xl bg-primary/[0.06] !px-2.5 !py-2.5"
                  />
                ) : (
                  <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[14px] font-bold',
                        item.done
                          ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                          : 'text-foreground/55',
                      )}
                    >
                      {formatQuestObjective(item.block)}
                    </span>
                    {flies !== null && (
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-0.5 text-[12px] font-black tabular-nums',
                          item.done ? 'text-muted-foreground/60' : 'text-amber-600 dark:text-amber-400',
                        )}
                      >
                        +{flies}
                        <Fly size={18} y={-2} paused interactive={false} />
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
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

function JourneyRail({
  first,
  last,
  done,
  nextDone,
  children,
}: {
  first: boolean;
  last: boolean;
  done: boolean;
  nextDone: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="relative flex w-8 shrink-0 flex-col items-center">
      <span
        className={cn(
          'w-[3px] flex-1',
          first ? 'bg-transparent' : done ? 'bg-[#4f9149]' : 'bg-border',
        )}
      />
      <span className="relative z-10">{children}</span>
      <span
        className={cn(
          'w-[3px] flex-1',
          last ? 'bg-transparent' : nextDone ? 'bg-[#4f9149]' : 'bg-border',
        )}
      />
    </span>
  );
}

export function SideQuestsCard({
  quests,
  rewardCatalog,
  isPremium,
  claimingObjectiveId,
  onClaimObjective,
}: {
  quests: QuestCardData[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claimingObjectiveId?: string | null;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
}) {
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const rows = quests.flatMap((quest) =>
    quest.logic
      .filter(
        (block) =>
          !(quest.claimedObjectiveIds ?? []).includes(block.id) &&
          (block.rewards?.length ?? 0) > 0,
      )
      .map((block) => ({ quest, block })),
  );
  if (rows.length === 0) return null;
  return (
    <div data-quest-anchor={quests.map((quest) => quest.id).join(' ')}>
      <QuestSectionHeader
        title={quests.length === 1 ? quests[0].title : 'Side quests'}
        count={`${rows.length} left`}
      />
      <div className={QUEST_CARD_CLASS}>
        {rows.map(({ quest, block }, i) => (
          <QuestObjectiveRow
            key={`${quest.id}:${block.id}`}
            block={block}
            divider={i > 0}
            claiming={claimingObjectiveId === block.id}
            isPremium={isPremium}
            rewardCatalog={rewardCatalog}
            onOpenRewards={(rewards) =>
              setRewardPopup({ eyebrow: 'Objective', title: 'Rewards', rewards })
            }
            onClaim={
              onClaimObjective
                ? () => onClaimObjective(quest.id, block.id)
                : undefined
            }
          />
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
      />
    </div>
  );
}

export function QuestObjectiveRow({
  block,
  claimed = false,
  claiming = false,
  isPremium,
  rewardCatalog,
  onOpenRewards,
  onClaim,
  divider = true,
  dimmed = false,
  className,
}: {
  block: QuestCardLogicBlock;
  claimed?: boolean;
  claiming?: boolean;
  isPremium: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onOpenRewards?: (rewards: QuestReward[]) => void;
  onClaim?: () => void;
  divider?: boolean;
  dimmed?: boolean;
  className?: string;
}) {
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const safeTarget = Math.max(1, block.target);
  const complete = block.progress >= safeTarget;
  const hasRewards = (block.rewards?.length ?? 0) > 0;
  const claimable = hasRewards && complete && !claimed;
  const done = claimed || (complete && !hasRewards);
  const rewards = hasRewards ? sortStreakPrizes(block.rewards!, rewardCatalog) : [];

  return (
    <div
      data-dock-row
      className={cn(
        'flex items-center gap-3 py-3 pl-3.5 pr-3 transition-opacity',
        divider && 'border-t border-border/50',
        dimmed && 'opacity-55',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => rewards.length > 0 && onOpenRewards?.(rewards)}
        aria-label="See rewards"
        className="min-h-11 min-w-11 shrink-0 rounded-xl"
      >
        <QuestRewardTileBadge
          rewards={rewards}
          catalog={rewardCatalog as never}
          isPremium={isPremium}
          small
        />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-[14px] font-bold leading-tight',
            done
              ? 'text-muted-foreground line-through decoration-muted-foreground/40'
              : 'text-foreground',
          )}
        >
          {done && (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#4f9149] text-white">
              <Check className="h-2.5 w-2.5" strokeWidth={4} />
            </span>
          )}
          <span className="min-w-0 truncate">{formatQuestObjective(block)}</span>
        </span>
        {!done && (
          <QuestTrack
            progress={block.progress}
            target={block.target}
            action={
              claimable && onClaim
                ? {
                    label: claiming ? 'Claiming…' : 'Claim',
                    disabled: claiming,
                    onPress: onClaim,
                  }
                : null
            }
          />
        )}
      </div>
      {!done && !claimable && !dimmed && (
        <span className="-mr-1.5 shrink-0 self-center">
          <HintButton
            iconOnly
            placement="bottom"
            text={objectiveHintText(block)}
            onShowMe={() =>
              startHintGuide(guideIdForBlock(block), guideContextForBlock(block))
            }
          />
        </span>
      )}
    </div>
  );
}

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
              className="h-12 rounded-2xl bg-primary text-[14px] font-black tracking-wide text-primary-foreground transition active:translate-y-[2px]"
            >
              {switching ? 'Keep current' : 'Keep tag'}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
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
  onRerollObjective,
  rerollingObjective,
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
  onRerollObjective?: () => void;
  rerollingObjective?: boolean;
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
  const needsTag = forceDimmed;

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
          <span className="text-[12px] font-black text-emerald-600/70 dark:text-emerald-400/70">
            {objectiveClaimed ? 'Claimed' : 'Done'}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        {onRerollObjective && !needsTag && (
          <button
            type="button"
            onClick={onRerollObjective}
            disabled={rerollingObjective}
            aria-label="Swap this objective"
            title="Swap this objective"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', rerollingObjective && 'animate-spin')}
            />
          </button>
        )}
        <HintButton
          text={objectiveHintText(block)}
          tags={undefined}
          onShowMe={
            needsTag
              ? undefined
              : () => {
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
          }
        />
      </div>
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
                  key={`${i}-${reward.type}-${reward.itemId ?? reward.backgroundId ?? ''}`}
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
                className="pointer-events-none absolute z-30 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-white/10 bg-black/55 px-1 text-[11px] font-black tracking-wide text-white shadow-sm backdrop-blur-sm"
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
            {formatQuestObjective(block)}
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
            <p className="text-[13px] font-black text-muted-foreground">
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
              key={`${index}-${reward.type}-${reward.itemId ?? reward.amount ?? reward.minAmount ?? ''}`}
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
  still = false,
  lightTone = false,
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
  /** Draw outfits as a one-frame snapshot instead of a live Rive frog. */
  still?: boolean;
  lightTone?: boolean;
}) {
  const { ref, hasHydrated } = useDelayedHydration<HTMLDivElement>(
    hydrateDelayMs,
  );
  const lookupId = reward.itemId ?? reward.backgroundId;
  const item = lookupId ? rewardCatalog[lookupId] : null;
  const isShield = reward.type === 'SHIELD';
  const baseTone = item
    ? REWARD_TILE_TONE[item.rarity]
    : reward.type === 'FLIES'
      ? REWARD_TILE_TONE.flies
      : isShield
        ? REWARD_TILE_TONE.uncommon
        : REWARD_TILE_TONE.default;
  const tone = lightTone ? lightTileTone(baseTone) : baseTone;
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
      ) : isShield ? (
        <Icon
          name="lilyPad"
          label="Lily Pad"
          className={cn('relative z-10', compact ? 'h-9 w-9' : 'h-7 w-7')}
        />
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
                : 'h-[124%] w-[124%]',
              // The box sits low inside its own rive frame, so every tile gets
              // the same lift. Applying it only to the animated tile is what
              // made a stack's lead gift float above its neighbours.
              '-translate-y-[13%]',
            )}
          >
            <GiftRive className="w-full h-full" color={item.riveIndex} paused={false} animation={giftAnimation} />
          </div>
        </div>
      ) : previewIndices && hasHydrated ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {still ? (
            <FrogSnapshot
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
            />
          ) : (
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
          )}
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

      {!hideBadge && hasRewardQuantityBadge(reward) && (
        <div
          className={cn(
            'absolute z-30 flex justify-center',
            compact ? '-right-1.5 -top-1.5' : '-right-1 -top-1',
          )}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-md border border-white/10 bg-black/50 font-bold tracking-wide text-white shadow-sm backdrop-blur-sm',
              compact
                ? 'min-w-5 px-1 py-0 text-[9px] leading-[16px]'
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

export function rewardLabel(
  reward: QuestReward,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium = false,
) {
  if (reward.type === 'FLIES')
    return `${getRewardQuantityLabel(reward, isPremium)} flies`;
  if (reward.type === 'SHIELD') {
    const amount = Math.max(1, reward.amount ?? 1);
    return amount > 1 ? `${amount} Lily Pads` : 'Lily Pad';
  }
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
  // Multiplication sign, not a lowercase x, to match the Lily Pad badge.
  return `\u00d7${base}`;
}

function getRewardOwnedCount(reward: QuestReward, _isPremium: boolean) {
  const base = reward.amount && reward.amount > 1 ? reward.amount : 1;
  return base;
}
