import type { QuestPromptKind, QuestReward } from '@/lib/quests/types';
import { QUEST_METRIC_COPY } from '@/lib/quests/metricLabels';

export type AdminRecipePoolEntry = {
  id: string;
  type:
    | 'count'
    | 'focus_minutes'
    | 'metric_count'
    | 'distinct_days'
    | 'deep_session'
    | 'day_parts'
    | 'season_step'
    | 'prompt';
  promptCategories?: string[];
  promptKinds?: QuestPromptKind[];
  action?: 'complete' | 'add';
  metricKey?: string;
  sessionMinutes?: number;
  requiresFollowThrough?: boolean;
  beforeHour?: number;
  scaleFromHistory?: boolean;
  scaleFactor?: number;
  streakDaysMin?: number;
  streakDaysMax?: number;
  minTarget: number;
  maxTarget: number;
  weight: number;
};

export type AdminRecipeBonusReward = {
  chance: number;
  reward: QuestReward;
};

export type AdminRecipeSlot = {
  id: string;
  pool: AdminRecipePoolEntry[];
  rewards: QuestReward[];
  bonusRewards?: AdminRecipeBonusReward[];
};

export type AdminRecipe = {
  recipeId: string;
  name: string;
  isActive: boolean;
  coverImageUrl?: string;
  slots: AdminRecipeSlot[];
};

export type EntryType = AdminRecipePoolEntry['type'];

export const PROMPT_KIND_LABELS: Record<QuestPromptKind, string> = {
  journal: 'Journal',
  poll: 'Poll',
  this_or_that: 'This or that',
  checkin: 'Check-in',
};

export const PROMPT_KIND_EMOJI: Record<QuestPromptKind, string> = {
  journal: '📝',
  poll: '📊',
  this_or_that: '⚖️',
  checkin: '💚',
};

export const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  gratitude: 'Gratitude',
  joy: 'Joy',
  growth: 'Growth',
  reflection: 'Reflection',
  wellbeing: 'Wellbeing',
  fun: 'Just for fun',
  planning: 'Planning',
};

export const ENTRY_TYPES: {
  type: EntryType;
  label: string;
  emoji: string;
  blurb: string;
}[] = [
  { type: 'count', label: 'Tasks', emoji: '✅', blurb: 'Finish or add tasks' },
  { type: 'prompt', label: 'Frog asks', emoji: '🐸', blurb: 'Answer a daily question' },
  { type: 'season_step', label: 'Season climb', emoji: '🏆', blurb: 'Climb one season step' },
  { type: 'focus_minutes', label: 'Focus time', emoji: '⏱️', blurb: 'Minutes on the timer' },
  { type: 'deep_session', label: 'Deep focus', emoji: '🎯', blurb: 'Unbroken focus sessions' },
  { type: 'day_parts', label: 'Spread the day', emoji: '🌤️', blurb: 'Tasks across day parts' },
  { type: 'metric_count', label: 'App action', emoji: '✨', blurb: 'Trade, invite, feed…' },
  { type: 'distinct_days', label: 'Show up', emoji: '📅', blurb: 'Active on N days' },
];

export function entryMeta(type: EntryType) {
  return ENTRY_TYPES.find((entry) => entry.type === type) ?? ENTRY_TYPES[0];
}

function range(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

function plural(count: string, one: string, many: string) {
  return count === '1' ? one : many;
}

export function describeEntry(entry: AdminRecipePoolEntry): string {
  const target = range(entry.minTarget, entry.maxTarget);
  switch (entry.type) {
    case 'count': {
      const scaled = entry.scaleFromHistory
        ? ` (${Math.round((entry.scaleFactor ?? 1) * 100)}% of their usual day)`
        : '';
      if (entry.action === 'add') {
        return `Add ${target} ${plural(target, 'task', 'tasks')}${entry.requiresFollowThrough ? ' and finish them' : ''}${scaled}`;
      }
      const before = entry.beforeHour ? ` before ${String(entry.beforeHour).padStart(2, '0')}:00` : '';
      return `Finish ${target} ${plural(target, 'task', 'tasks')}${before}${scaled}`;
    }
    case 'focus_minutes':
      return `Focus for ${target} minutes${entry.scaleFromHistory ? ' (scaled to them)' : ''}`;
    case 'deep_session':
      return `${target} unbroken ${entry.sessionMinutes ?? 25}-min ${plural(target, 'session', 'sessions')}`;
    case 'day_parts':
      return `Finish tasks in ${target} parts of the day`;
    case 'distinct_days':
      return `Show up on ${target} ${plural(target, 'day', 'days')}`;
    case 'metric_count': {
      if (entry.metricKey?.startsWith('task_streak')) {
        return `Keep ${target} repeating ${plural(target, 'task', 'tasks')} on a ${range(entry.streakDaysMin ?? 3, entry.streakDaysMax ?? entry.streakDaysMin ?? 3)}-day streak`;
      }
      const copy = entry.metricKey ? QUEST_METRIC_COPY[entry.metricKey] : undefined;
      if (copy) return copy.label(entry.maxTarget);
      return `App action × ${target}`;
    }
    case 'season_step':
      return 'Climb one season step';
    case 'prompt': {
      const kinds = entry.promptKinds?.length
        ? entry.promptKinds.map((kind) => PROMPT_KIND_LABELS[kind].toLowerCase()).join(', ')
        : null;
      const cats = entry.promptCategories?.length
        ? entry.promptCategories.map((cat) => (PROMPT_CATEGORY_LABELS[cat] ?? cat).toLowerCase()).join(', ')
        : null;
      const detail = [kinds, cats].filter(Boolean).join(' · ');
      return detail ? `Answer Frog asks (${detail})` : 'Answer Frog asks';
    }
    default:
      return 'Objective';
  }
}

export function slotHeadline(slot: AdminRecipeSlot): string {
  if (slot.pool.length === 1) return describeEntry(slot.pool[0]);
  const top = [...slot.pool].sort((a, b) => b.weight - a.weight)[0];
  return describeEntry(top);
}

export function entryChance(slot: AdminRecipeSlot, entry: AdminRecipePoolEntry) {
  const total = slot.pool.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return 0;
  return Math.round((Math.max(0, entry.weight) / total) * 100);
}

export function rewardLabel(reward: QuestReward, names?: Record<string, { name?: string }>) {
  if (reward.type === 'FLIES') {
    if (reward.amountMode === 'random') {
      return `${range(reward.minAmount ?? 1, reward.maxAmount ?? reward.minAmount ?? 1)} flies`;
    }
    return `${reward.amount ?? 1} flies`;
  }
  if (reward.type === 'SHIELD') return (reward.amount ?? 1) > 1 ? `${reward.amount} Lily Pads` : 'Lily Pad';
  const id = reward.itemId ?? reward.backgroundId;
  const name = id ? names?.[id]?.name ?? id : null;
  if (reward.type === 'BOX') return name ?? 'Gift box';
  if (reward.type === 'BACKGROUND') return name ?? 'Background';
  return name ?? 'Item';
}

export function newEntry(type: EntryType = 'count'): AdminRecipePoolEntry {
  const base: AdminRecipePoolEntry = {
    id: crypto.randomUUID(),
    type,
    minTarget: 1,
    maxTarget: 1,
    weight: 1,
  };
  return withTypeDefaults(base, type);
}

export function withTypeDefaults(entry: AdminRecipePoolEntry, type: EntryType): AdminRecipePoolEntry {
  const next: AdminRecipePoolEntry = {
    id: entry.id,
    type,
    minTarget: entry.minTarget,
    maxTarget: entry.maxTarget,
    weight: entry.weight,
  };
  if (type === 'season_step' || type === 'prompt') {
    next.minTarget = 1;
    next.maxTarget = 1;
  }
  if (type === 'prompt') {
    next.promptCategories = entry.promptCategories;
    next.promptKinds = entry.promptKinds;
  }
  if (type === 'count') {
    next.action = entry.action ?? 'complete';
    next.requiresFollowThrough = entry.requiresFollowThrough;
    next.beforeHour = entry.beforeHour;
  }
  if (type === 'count' || type === 'focus_minutes') {
    next.scaleFromHistory = entry.scaleFromHistory;
    next.scaleFactor = entry.scaleFactor;
  }
  if (type === 'focus_minutes' && entry.type !== 'focus_minutes') {
    next.minTarget = 15;
    next.maxTarget = 25;
  }
  if (type === 'deep_session') next.sessionMinutes = entry.sessionMinutes ?? 25;
  if (type === 'metric_count') {
    next.metricKey = entry.metricKey ?? 'trade_completed';
    next.streakDaysMin = entry.streakDaysMin;
    next.streakDaysMax = entry.streakDaysMax;
  }
  if (type === 'day_parts' && entry.type !== 'day_parts') {
    next.minTarget = 2;
    next.maxTarget = 2;
  }
  return next;
}
