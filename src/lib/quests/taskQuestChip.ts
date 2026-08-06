import type { Trackable } from '@/lib/questClaims';

export type TaskQuestChip = {
  questId?: string;
  categoryId?: string;
  categoryName: string;
  remaining: number;
  label: string;
  flies: number;
};

// The objective's own remaining copy, minus the scope words the adjacent tag
// chip already says. "Complete 2 more Fitness tasks" on a row tagged Fitness
// reads as a stutter; "2 more tasks" does not.
function condenseRemaining(remainingLabel: string, categoryName: string) {
  return remainingLabel
    .replace(new RegExp(`\\s*${escapeRegExp(categoryName)}\\s*`, 'i'), ' ')
    .replace(/\bquest tasks?\b/i, (m) => (m.endsWith('s') ? 'tasks' : 'task'))
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Removing the category can leave the preposition that pointed at it.
    .replace(/\s+(on|for|in|to)$/i, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fliesFromRewards(rewards: unknown): number {
  if (!Array.isArray(rewards)) return 0;
  return rewards.reduce<number>((sum, reward: any) => {
    if (reward?.type !== 'FLIES') return sum;
    return sum + Math.max(0, reward.amount ?? reward.minAmount ?? 0);
  }, 0);
}

/**
 * Which focus objective a task feeds, matched on the tags the objective is
 * scoped to. Only tag-scoped, unfinished, actionable objectives qualify —
 * a chip that points at something already done is noise.
 */
export function buildTaskQuestChipLookup(
  trackables: Trackable[] | undefined,
): (taskTagIds: string[] | undefined) => TaskQuestChip | null {
  const scoped = (trackables ?? []).filter(
    (t) =>
      t.placement === 'category' &&
      !t.needsFocusTags &&
      (t.tags?.length ?? 0) > 0 &&
      t.progress < t.target,
  );
  if (scoped.length === 0) return () => null;

  // Lowest tier first: the objective a user can actually close next is more
  // useful on a row than the capstone they are nowhere near.
  const byTier = [...scoped].sort(
    (a, b) =>
      (a.tierIndex ?? 0) - (b.tierIndex ?? 0) ||
      a.target - a.progress - (b.target - b.progress),
  );

  return (taskTagIds) => {
    if (!taskTagIds?.length) return null;
    const wanted = new Set(taskTagIds);
    const match = byTier.find((t) => t.tags?.some((tag) => wanted.has(tag.id)));
    if (!match) return null;
    const remaining = Math.max(1, match.target - match.progress);
    const categoryName = match.categoryName ?? 'Focus';
    return {
      questId: match.questId,
      categoryId: match.categoryId,
      categoryName,
      remaining,
      label: condenseRemaining(match.remainingLabel, categoryName),
      flies: fliesFromRewards(match.rewards ?? (match.reward ? [match.reward] : [])),
    };
  };
}
