import type { TaskDoc } from '@/lib/models/Task';
import type { QuestDoc } from '@/lib/models/Quest';
import type { FocusProfile, ResolvedQuestLogicBlock } from '@/lib/quests/types';

type AnalyticsProperties = Record<string, string | number | boolean>;

type RewardSummary = {
  fliesGranted: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
};

function focusTagIds(profile?: Pick<FocusProfile, 'categoryTagMap'> | null) {
  return new Set(
    (profile?.categoryTagMap ?? []).flatMap((entry) => entry.tagIds ?? []),
  );
}

function streakTier(streak: number) {
  if (streak < 2) return 'none';
  if (streak < 7) return '2_to_6';
  if (streak < 30) return '7_to_29';
  return '30_plus';
}

export function taskAnalyticsProperties(
  task: Partial<TaskDoc>,
  profile?: Pick<FocusProfile, 'categoryTagMap'> | null,
  extras: AnalyticsProperties = {},
): AnalyticsProperties {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const focusIds = focusTagIds(profile);
  const focusedTags = tags.filter((tagId) => focusIds.has(tagId));
  const repeatMode = task.repeatMode ?? (task.type === 'weekly' ? 'weekly' : 'none');
  const streak = typeof extras.streak_length === 'number' ? extras.streak_length : 0;

  return {
    task_type: task.type ?? 'regular',
    tag_count: tags.length,
    focus_tag_count: focusedTags.length,
    focus_connected: focusedTags.length > 0,
    buddy: !!task.bondId,
    recurring: repeatMode !== 'none',
    repeat_mode: repeatMode,
    checklist_count: Array.isArray(task.checklist) ? task.checklist.length : 0,
    has_schedule: !!task.startTime || !!task.endTime,
    has_reminder: !!task.reminder,
    streak_length: streak,
    streak_tier: streakTier(streak),
    ...extras,
  };
}

function generatedTier(quest: Pick<QuestDoc, 'logic'>, block?: ResolvedQuestLogicBlock) {
  if (!block) return 0;
  const slotMatch = /^slot-(\d+)$/.exec(block.id);
  if (slotMatch) return Number(slotMatch[1]);
  const index = (quest.logic ?? []).findIndex((candidate) => candidate.id === block.id);
  return index >= 0 ? index + 1 : 0;
}

function rewardType(summary: RewardSummary) {
  const items = summary.grantedItemIds.length + summary.grantedBackgroundIds.length;
  if (summary.fliesGranted > 0 && items > 0) return 'mixed';
  if (items > 0) return 'item';
  return 'flies';
}

export function questAnalyticsProperties(
  quest: Pick<QuestDoc, 'templateId' | 'placement' | 'categoryId' | 'logic'>,
  summary: RewardSummary,
  block?: ResolvedQuestLogicBlock,
): AnalyticsProperties {
  const generated = quest.templateId.startsWith('gen:') || quest.templateId.startsWith('gend:');
  const properties: AnalyticsProperties = {
    quest_placement: quest.placement,
    claim_type: quest.placement,
    quest_category: quest.categoryId ?? (quest.placement === 'daily' ? 'daily' : 'uncategorized'),
    quest_generation: generated ? 'generated' : 'authored',
    quest_tier: generated
      ? block
        ? generatedTier(quest, block)
        : 'whole_quest'
      : 'not_applicable',
    objective_count: quest.logic?.length ?? 0,
    reward_type: rewardType(summary),
    reward_amount: summary.fliesGranted,
    reward_count: summary.grantedItemIds.length + summary.grantedBackgroundIds.length,
  };

  if (block) {
    properties.objective_type = block.type;
    properties.objective_subject = block.subject;
    properties.objective_action = block.action ?? 'none';
    properties.objective_tag_mode = block.tagMode ?? 'ignore';
    properties.objective_metric = block.metricKey ?? 'none';
    properties.objective_target = block.target;
  }

  return properties;
}
