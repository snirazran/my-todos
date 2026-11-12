'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Copy,
  Gift,
  Lock,
  Monitor,
  RotateCw,
  Sparkles,
  TriangleAlert,
  Trophy,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasRewardQuantityBadge } from '@/lib/quests/rewardQuantity';
import { metricObjectiveLabel } from '@/lib/quests/metricLabels';
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
import { HOME_CARD_SURFACE } from './taskSurfaces';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { QuestTrack } from './QuestTrack';
import { guideContextForBlock, guideIdForBlock } from '@/lib/hints/guides';
import { useUIStore } from '@/lib/uiStore';
import { useRegisterOpenSheet } from '@/lib/sheetStore';

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
  | 'seasonId'
  | 'seasonTier'
  | 'seasonRewards'
  | 'seasonReady'
  | 'seasonClaimed'
  | 'promptId'
  | 'promptKind'
  | 'promptQuestion'
  | 'promptPlaceholder'
  | 'promptOptions'
  | 'promptAnswered'
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

  if (block.type === 'season_step') {
    return block.seasonTier ? `Climb to Tier ${block.seasonTier}` : 'Climb the season';
  }

  if (block.type === 'prompt') {
    return block.promptQuestion ?? 'Answer today’s question';
  }

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

export function dailyRowState(
  block: QuestCardLogicBlock,
  claimed: boolean,
): QuestPathNodeState {
  const complete = block.progress >= Math.max(1, block.target);
  if (block.type === 'season_step') {
    if (block.seasonClaimed) return 'done';
    if (block.seasonReady) return 'ready';
    return complete ? 'done' : 'open';
  }
  if (block.type === 'prompt') {
    return claimed || block.promptAnswered ? 'done' : 'open';
  }
  const hasRewards = (block.rewards?.length ?? 0) > 0;
  return claimed || (complete && !hasRewards) ? 'done' : complete ? 'ready' : 'open';
}

function DailyBonusStrip({
  done,
  total,
  sweep,
  claiming,
  onClaim,
  rewardCatalog,
  isPremium,
  paused,
}: {
  done: number;
  total: number;
  sweep: DailySweepInfo;
  claiming: boolean;
  onClaim?: () => void;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  paused: boolean;
}) {
  const [oddsOpen, setOddsOpen] = useState(false);
  const ready = sweep.claimable && !!onClaim;
  const resting = sweep.todayComplete && !ready;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[18px] py-3 pl-4 pr-3 transition-colors duration-300',
        ready
          ? cn(QUEST_ROW_CARD, 'bg-[var(--season-tint,#fffbeb)] dark:bg-[var(--season-soft,rgba(245,158,11,0.1))]')
          : 'border-2 border-dashed border-foreground/[0.12]',
      )}
    >
      <button
        type="button"
        onClick={() => setOddsOpen(true)}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={cn(
            'text-[14.5px] font-bold leading-tight',
            resting ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {ready ? 'Prize ready!' : resting ? 'Prize won' : 'Finish all daily quests to win a prize'}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] font-semibold leading-tight text-muted-foreground">
          {ready
            ? sweep.pendingRolls > 1
              ? `${sweep.pendingRolls} prizes waiting`
              : 'You finished every quest'
            : resting
              ? 'New quests tomorrow'
              : 'Tap to see what you can win'}
        </p>
      </button>

      {ready ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--season-accent,#58a83f)] px-4 text-[14px] font-black text-[var(--season-on-accent,#fff)] shadow-[0_3px_0_0_var(--season-accent-lip,#2f6b1f)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60"
        >
          {claiming ? 'Opening…' : 'Open'}
        </button>
      ) : !resting && total > 0 ? (
        <span className="flex shrink-0 items-center gap-1 pr-0.5" aria-label={`${done} of ${total} quests done`}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-2 w-2 rounded-full transition-colors duration-500',
                i < done ? 'bg-[#58a54f]' : 'bg-foreground/15',
              )}
            />
          ))}
        </span>
      ) : null}

      <SweepOddsPopup
        open={oddsOpen}
        sweep={sweep}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setOddsOpen(false)}
        paused={paused}
      />
    </div>
  );
}

function dailyRowLabel(block: QuestCardLogicBlock) {
  if (block.type === 'season_step') {
    return block.seasonTier ? `Earn Day ${block.seasonTier} reward` : undefined;
  }
  if (block.type === 'prompt') return undefined;
  const base = formatQuestObjective(block);
  const match = /^Finish (\d+) tasks?\b/.exec(base);
  if (!match) return undefined;
  const count = Number(match[1]);
  return `Complete ${count} ${count === 1 ? 'goal' : 'goals'}${base.slice(match[0].length)}`;
}

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
  claimingSeason = false,
  onClaimSeasonStep,
  onAnswerPrompt,
  onOpenSeason,
}: Omit<BaseCardProps, 'onClaimObjective'> & {
  quests: Array<QuestCardData & { placement: 'daily' }>;
  onClaimObjective?: (questId: string, objectiveId: string) => void;
  sweep?: DailySweepInfo | null;
  claimingSweep?: boolean;
  onClaimSweep?: () => void;
  claimingSeason?: boolean;
  onClaimSeasonStep?: (seasonId: string, tier: number) => void;
  onAnswerPrompt?: (questId: string, block: QuestCardLogicBlock) => void;
  onOpenSeason?: () => void;
}) {
  const timeLeft = useTimeLeft();
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const rows = quests.flatMap((quest) =>
    quest.logic.map((block) => {
      const claimed = (quest.claimedObjectiveIds ?? []).includes(block.id);
      return { quest, block, claimed, state: dailyRowState(block, claimed) };
    }),
  );
  const total = rows.length;
  const done = rows.filter((row) => row.state !== 'open').length;
  const openCount = total - done;

  return (
    <div>
      <QuestSectionHeader
        title="Daily quests"
        count={total > 0 && openCount === 0 ? 'All done' : openCount > 0 ? `${openCount} left` : undefined}
        right={
          timeLeft ? (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap pr-1 text-[12px] font-black tabular-nums text-muted-foreground">
              <RotateCw className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
              {timeLeft}
            </span>
          ) : null
        }
      />

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <QuestObjectiveRow
            key={`${row.quest.id}:${row.block.id}`}
            block={row.block}
            card
            label={dailyRowLabel(row.block)}
            onGo={
              row.block.type === 'season_step'
                ? onOpenSeason ?? null
                : row.block.type === 'prompt'
                  ? undefined
                  : null
            }
            claimed={row.claimed}
            claiming={
              row.block.type === 'season_step'
                ? claimingSeason
                : claimingObjectiveId === row.block.id
            }
            isPremium={isPremium}
            rewardCatalog={rewardCatalog}
            onOpenRewards={(rewards) =>
              setRewardPopup({
                eyebrow: row.block.type === 'season_step' ? 'Season' : 'Quest',
                title:
                  row.block.type === 'season_step' && row.block.seasonTier
                    ? `Tier ${row.block.seasonTier} rewards`
                    : 'Rewards',
                rewards,
              })
            }
            onClaim={
              row.block.type === 'season_step'
                ? onClaimSeasonStep && row.block.seasonId && row.block.seasonTier
                  ? () => onClaimSeasonStep(row.block.seasonId!, row.block.seasonTier!)
                  : undefined
                : onClaimObjective
                  ? () => onClaimObjective(row.quest.id, row.block.id)
                  : undefined
            }
            onAnswer={
              row.block.type === 'prompt' && onAnswerPrompt
                ? () => onAnswerPrompt(row.quest.id, row.block)
                : undefined
            }
          />
        ))}

        {sweep ? (
          <DailyBonusStrip
            done={done}
            total={total}
            sweep={sweep}
            claiming={claimingSweep}
            onClaim={onClaimSweep}
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

export const QUEST_CARD_CLASS = `overflow-hidden ${HOME_CARD_SURFACE}`;

export const QUEST_ROW_CARD = HOME_CARD_SURFACE;

export function QuestGoButton({
  onPress,
  label = 'Show me how',
  className,
}: {
  onPress: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className={cn(
        'grid h-11 w-12 shrink-0 touch-manipulation place-items-center rounded-[14px] bg-muted text-foreground/55 shadow-[0_3px_0_0_rgba(15,23,42,0.13)] transition-[transform,box-shadow,color] duration-150 hover:-translate-y-px hover:text-foreground/80 hover:shadow-[0_4px_0_0_rgba(15,23,42,0.13)] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:shadow-[0_3px_0_0_rgba(0,0,0,0.5)]',
        className,
      )}
    >
      <ArrowRight className="h-5 w-5" strokeWidth={3} />
    </button>
  );
}

export type QuestPathNodeState = 'open' | 'ready' | 'done' | 'locked';

function QuestPathNode({
  state,
  prize = false,
  icon,
}: {
  state: QuestPathNodeState;
  prize?: boolean;
  icon?: React.ReactNode;
}) {
  const size = prize ? 'h-8 w-8' : 'h-[26px] w-[26px]';
  if (state === 'done') {
    return (
      <span className={cn('grid place-items-center rounded-full bg-[#4f9149] text-white ring-4 ring-background', size)}>
        <Check className={prize ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={3.5} />
      </span>
    );
  }
  if (state === 'ready') {
    return (
      <span className={cn('grid place-items-center rounded-full bg-[var(--season-accent,#f59e0b)] text-white ring-4 ring-background', size)}>
        {prize ? <Gift className="h-4 w-4" strokeWidth={2.75} /> : <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
      </span>
    );
  }
  if (state === 'locked') {
    return (
      <span className={cn('grid place-items-center rounded-full bg-amber-100 text-amber-600 ring-4 ring-background dark:bg-amber-500/15', size)}>
        {icon ?? <Lock className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    );
  }
  if (prize) {
    return (
      <span className={cn('grid place-items-center rounded-full border-[2.5px] border-[var(--season-fill,rgba(251,191,36,0.7))] bg-[var(--season-tint,#fffbeb)] text-[var(--season-accent,#f59e0b)] ring-4 ring-background dark:bg-[var(--season-soft,rgba(245,158,11,0.1))]', size)}>
        <Gift className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'grid place-items-center rounded-full border-[2.5px] border-primary bg-card ring-4 ring-background',
        size,
      )}
    />
  );
}

export type QuestPathStop = {
  key: string;
  state: QuestPathNodeState;
  prize?: boolean;
  icon?: React.ReactNode;
  content: React.ReactNode;
};

export function QuestPath({ stops }: { stops: QuestPathStop[] }) {
  const reached = stops.map((stop) => stop.state === 'done' || stop.state === 'ready');
  return (
    <ol className="flex flex-col gap-2 lg:-ml-[38px]">
      {stops.map((stop, index) => {
        const first = index === 0;
        const last = index === stops.length - 1;
        const topReached = !first && reached[index - 1] && reached[index];
        const bottomReached = !last && reached[index] && reached[index + 1];
        return (
          <li key={stop.key} className="flex items-stretch gap-1.5">
            <span aria-hidden className="relative flex w-8 shrink-0 flex-col items-center">
              <span
                className={cn(
                  'flex-1',
                  first
                    ? 'opacity-0'
                    : topReached
                      ? 'w-[3px] bg-[#4f9149]'
                      : 'w-[2.5px] bg-[linear-gradient(currentColor_6px,transparent_6px)] bg-[length:100%_11px] bg-top text-muted-foreground/30',
                )}
              />
              <span className="relative z-10 py-1">
                <QuestPathNode state={stop.state} prize={stop.prize} icon={stop.icon} />
              </span>
              <span
                className={cn(
                  '-mb-2 flex-1',
                  last
                    ? 'opacity-0'
                    : bottomReached
                      ? 'w-[3px] bg-[#4f9149]'
                      : 'w-[2.5px] bg-[linear-gradient(currentColor_6px,transparent_6px)] bg-[length:100%_11px] bg-bottom text-muted-foreground/30',
                )}
              />
            </span>
            <div className="min-w-0 flex-1">{stop.content}</div>
          </li>
        );
      })}
    </ol>
  );
}

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
          <span className="shrink-0 text-[14px] font-bold text-muted-foreground narrow:hidden">
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
  still,
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
  still?: boolean;
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
        still={still}
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

function SweepOddsPopup({
  open,
  sweep,
  rewardCatalog,
  isPremium,
  onClose,
  paused = false,
}: {
  open: boolean;
  sweep: DailySweepInfo;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onClose: () => void;
  paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const probeRef = useRef<HTMLSpanElement>(null);
  const [seasonVars, setSeasonVars] = useState<React.CSSProperties>({});
  useRegisterOpenSheet(open);
  useEffect(() => {
    if (!open || !probeRef.current) return;
    const computed = getComputedStyle(probeRef.current);
    const next: Record<string, string> = {};
    SEASON_VAR_NAMES.forEach((name) => {
      const value = computed.getPropertyValue(name).trim();
      if (value) next[name] = value;
    });
    setSeasonVars(next as React.CSSProperties);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const table = sweep.standardRoll;
  const total = table.reduce((sum, entry) => sum + Math.max(0, entry.chance), 0) || 1;
  const top = table.reduce((max, entry) => Math.max(max, entry.chance), 0) || 1;

  if (typeof document === 'undefined') return null;

  return (
    <>
      <span ref={probeRef} hidden />
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="sweep-odds"
              style={seasonVars}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sweep-odds-title"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              className="fixed inset-0 z-[1320] flex select-none flex-col overflow-hidden bg-background"
            >
              <div className="relative shrink-0 bg-[var(--season-band,#1f4a2a)]">
                <div className="mx-auto w-full max-w-[36rem] px-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))] md:px-6 md:pb-12 md:pt-10">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close daily prizes"
                    className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-11 w-11 touch-manipulation place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/20 transition-transform active:scale-95 md:right-6 md:top-6"
                  >
                    <X className="h-5 w-5" strokeWidth={2.75} />
                  </button>
                  <span className="inline-flex h-7 items-center rounded-full bg-white/15 px-2.5 text-[11.5px] font-black uppercase tracking-[0.08em] text-white/85">
                    Daily quests
                  </span>
                  <h2
                    id="sweep-odds-title"
                    className="mt-2 pr-12 text-[28px] font-black leading-tight tracking-tight text-white"
                  >
                    Daily prize
                  </h2>
                  <p className="mt-1 text-[14px] font-semibold leading-snug text-white/75">
                    Finish all daily quests to win one of these.
                  </p>
                </div>
              </div>

              <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)]">
                <div className="no-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
                  <div className="mx-auto w-full max-w-[36rem] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 md:px-6">
                    <div className="flex flex-col gap-2">
                      {table.map((entry, index) => {
                        const chance = (100 * Math.max(0, entry.chance)) / total;
                        return (
                          <div
                            key={entry.id || index}
                            className={cn(QUEST_ROW_CARD, 'flex items-center gap-3 py-3 pl-3 pr-4')}
                          >
                            <SweepRewardTile
                              reward={entry.reward}
                              rewardCatalog={rewardCatalog}
                              isPremium={isPremium}
                              paused={paused}
                              flySize={36}
                              flyOversample={1.25}
                              className="h-14 w-14 shrink-0 rounded-[14px]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-bold leading-tight text-foreground">
                                {sweepRewardLabel(entry.reward, rewardCatalog, isPremium)}
                              </p>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
                                <div
                                  className="h-full rounded-full bg-[var(--season-accent,#58a54f)]"
                                  style={{ width: `${Math.max(4, (100 * entry.chance) / top)}%` }}
                                />
                              </div>
                            </div>
                            <span className="w-12 shrink-0 text-right text-[15px] font-black tabular-nums text-foreground">
                              {formatChance(chance)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

const SEASON_VAR_NAMES = [
  '--season-band',
  '--season-band-lip',
  '--season-accent',
  '--season-accent-lip',
  '--season-on-accent',
  '--season-soft',
  '--season-tint',
];

function formatChance(value: number) {
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
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
    <div className={cn(QUEST_ROW_CARD, 'py-3 pl-3 pr-3')}>
      <div className="flex items-center gap-3">
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
          <p className="text-[15px] font-bold leading-tight text-foreground">
            {moveToWeb.claimable
              ? 'Your reward is ready!'
              : 'Plan your week on the big screen'}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold leading-tight text-muted-foreground">
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
              className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--season-accent,#f59e0b)] px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_var(--season-accent-lip,#b45309)] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_var(--season-accent-lip,#b45309)] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? 'Claiming...' : 'Claim'}
            </button>
          </span>
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-sky-500/10 text-sky-500">
            <Monitor className="h-5 w-5" strokeWidth={2.5} />
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

export function QuestObjectiveRow({
  block,
  claimed = false,
  claiming = false,
  isPremium,
  rewardCatalog,
  onOpenRewards,
  onClaim,
  onAnswer,
  card = false,
  divider = true,
  dimmed = false,
  className,
  label,
  onGo,
}: {
  label?: string;
  onGo?: (() => void) | null;
  block: QuestCardLogicBlock;
  claimed?: boolean;
  claiming?: boolean;
  isPremium: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onOpenRewards?: (rewards: QuestReward[]) => void;
  onClaim?: () => void;
  onAnswer?: () => void;
  card?: boolean;
  divider?: boolean;
  dimmed?: boolean;
  className?: string;
}) {
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const isSeason = block.type === 'season_step';
  const isPrompt = block.type === 'prompt';
  const shownRewardList = isSeason ? block.seasonRewards ?? [] : block.rewards ?? [];
  const hasRewards = shownRewardList.length > 0;
  const rowState = dailyRowState(block, claimed);
  const claimable = rowState === 'ready';
  const done = rowState === 'done';
  const rewards = hasRewards ? sortStreakPrizes(shownRewardList, rewardCatalog) : [];
  const communityPrompt =
    block.promptKind === 'poll' || block.promptKind === 'this_or_that';

  return (
    <div
      data-dock-row
      className={cn(
        'flex items-center gap-3 transition-[opacity,background-color] duration-300',
        card
          ? cn(
              QUEST_ROW_CARD,
              'pl-3 pr-3',
              done ? 'py-2' : 'py-3',
              claimable && 'bg-[var(--season-tint,#fffbeb)] dark:bg-[var(--season-soft,rgba(245,158,11,0.1))]',
            )
          : cn('py-3 pl-3.5 pr-3', divider && 'border-t border-border/50'),
        dimmed && 'opacity-55',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => rewards.length > 0 && onOpenRewards?.(rewards)}
        aria-label="See rewards"
        className={cn(
          'min-h-11 min-w-11 shrink-0 rounded-xl transition-opacity',
          done && card && 'opacity-45 grayscale-[0.4]',
        )}
      >
        <QuestRewardTileBadge
          rewards={rewards}
          catalog={rewardCatalog as never}
          isPremium={isSeason ? false : isPremium}
          small={!card}
        />
      </button>
      <div className={cn('flex min-w-0 flex-1 flex-col', card ? 'gap-2' : 'gap-1.5')}>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 font-bold leading-tight',
            card ? 'text-[15px]' : 'text-[14px]',
            done
              ? 'text-muted-foreground line-through decoration-muted-foreground/40'
              : 'text-foreground',
          )}
        >
          {done && !card && (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#4f9149] text-white">
              <Check className="h-2.5 w-2.5" strokeWidth={4} />
            </span>
          )}
          <span className={cn('flex min-w-0 flex-col', card ? '' : 'truncate')}>
            <span className={card ? 'line-clamp-2' : 'min-w-0 truncate'}>
              {label ?? formatQuestObjective(block)}
            </span>
          </span>
        </span>
        {!done && !isPrompt && (
          <QuestTrack
            progress={block.progress}
            target={block.target}
            size={card ? 'lg' : 'md'}
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
      {isPrompt && !dimmed ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {!done ? (
            <button
              type="button"
              onClick={onAnswer}
              disabled={!onAnswer}
              className="h-11 shrink-0 rounded-[14px] bg-[var(--season-accent,#58a83f)] px-4 text-[14px] font-black text-[var(--season-on-accent,#fff)] shadow-[0_3px_0_0_var(--season-accent-lip,#2f6b1f)] transition-transform active:translate-y-[3px] active:shadow-none"
            >
              Answer
            </button>
          ) : communityPrompt && onAnswer ? (
            <button
              type="button"
              onClick={onAnswer}
              className="h-9 shrink-0 rounded-[12px] bg-muted px-3 text-[13px] font-black text-foreground/70 transition-colors hover:text-foreground"
            >
              Results
            </button>
          ) : null}
        </div>
      ) : onGo !== null && !done && !claimable && !dimmed && (onGo || !isSeason) ? (
        <QuestGoButton
          onPress={
            onGo ??
            (() => startHintGuide(guideIdForBlock(block), guideContextForBlock(block)))
          }
        />
      ) : null}
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

export function RewardDetailsPopup({
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
      data-fly-source={reward.type === 'FLIES' ? '' : undefined}
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
