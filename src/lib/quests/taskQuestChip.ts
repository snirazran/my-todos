import type { Trackable } from '@/lib/questClaims';

export type TaskQuestChip = {
  questId?: string;
  categoryId?: string;
  categoryName: string;
  tier: number | null;
  remaining: number;
  color: string;
  label: string;
};

const DEFAULT_CHIP_COLOR = '#22c55e';

function chipLabel(categoryName: string, tier: number | null, remaining: number) {
  const tierPart = tier ? ` · tier ${tier}` : '';
  return `${categoryName}${tierPart} · ${remaining} to go`;
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
    const tier =
      typeof match.tierIndex === 'number' ? match.tierIndex + 1 : null;
    const categoryName = match.categoryName ?? 'Focus';
    return {
      questId: match.questId,
      categoryId: match.categoryId,
      categoryName,
      tier,
      remaining,
      color: match.tags?.[0]?.color || DEFAULT_CHIP_COLOR,
      label: chipLabel(categoryName, tier, remaining),
    };
  };
}
