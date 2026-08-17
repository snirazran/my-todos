import { checklistPayout, type ChecklistItem } from './checklist';

export type StreakTier = {
  /** Streak length this rate starts at. */
  minDays: number;
  /** What a completion pays at this streak — it REPLACES the base fly. */
  flies: number;
};

/**
 * The per-completion uplift. It replaces the base fly rather than stacking on
 * it, and it stops climbing at the last tier: a habit kept 300 days pays the
 * same per tick as one kept 30. The prestige is the number, not the payout —
 * an ever-growing per-completion figure is the exploit surface.
 */
export const DEFAULT_STREAK_TIERS: readonly StreakTier[] = [
  { minDays: 1, flies: 1 },
  { minDays: 3, flies: 2 },
  { minDays: 7, flies: 3 },
  { minDays: 14, flies: 4 },
  { minDays: 30, flies: 5 },
];

export type StreakMilestone = {
  /** Streak length that earns this payout, once per task. */
  atDays: number;
  flies: number;
  giftItemId?: string;
  /** Lily Pads granted alongside the flies. */
  shields?: number;
};

export const DEFAULT_STREAK_MILESTONES: readonly StreakMilestone[] = [
  { atDays: 3, flies: 5 },
  { atDays: 7, flies: 15, giftItemId: 'gift_box_1' },
  { atDays: 14, flies: 30, giftItemId: 'gift_box_rare' },
  { atDays: 30, flies: 60, giftItemId: 'gift_box_legendary', shields: 1 },
];

/** What every further cycle pays once the fixed milestones are exhausted. */
export const DEFAULT_STREAK_REPEAT = {
  everyDays: 30,
  flies: 50,
  giftItemId: 'gift_box_rare',
  shields: 0,
};

export type StreakRepeat = typeof DEFAULT_STREAK_REPEAT;

function sortedTiers(tiers: readonly StreakTier[]): StreakTier[] {
  return [...tiers].sort((a, b) => a.minDays - b.minDays);
}

/** Flies a completion pays at this streak length. */
export function streakFlyBase(
  streak: number,
  tiers: readonly StreakTier[] = DEFAULT_STREAK_TIERS,
): number {
  let flies = 1;
  for (const tier of sortedTiers(tiers)) {
    if (streak >= tier.minDays) flies = tier.flies;
  }
  return Math.max(0, flies);
}

/** Flies the streak adds on top of the task's own base fly. */
export function streakFlyBonus(
  streak: number,
  tiers: readonly StreakTier[] = DEFAULT_STREAK_TIERS,
): number {
  return Math.max(0, streakFlyBase(streak, tiers) - 1);
}

/**
 * The milestone a streak of exactly this length earns, if any. Past the last
 * fixed milestone the repeat cycle takes over, so a 60-day habit lands one and
 * a 90-day habit lands another.
 */
export function milestoneForStreak(
  streak: number,
  milestones: readonly StreakMilestone[] = DEFAULT_STREAK_MILESTONES,
  repeat: StreakRepeat = DEFAULT_STREAK_REPEAT,
): StreakMilestone | null {
  const exact = milestones.find((milestone) => milestone.atDays === streak);
  if (exact) return exact;

  const last = milestones.reduce(
    (highest, milestone) => Math.max(highest, milestone.atDays),
    0,
  );
  const every = Math.max(0, Math.floor(repeat.everyDays));
  if (!every || streak <= last) return null;
  if ((streak - last) % every !== 0) return null;
  return {
    atDays: streak,
    flies: repeat.flies,
    giftItemId: repeat.giftItemId || undefined,
    shields: repeat.shields || undefined,
  };
}

/** Every milestone day a streak of this length has passed, oldest first. */
export function milestonesUpTo(
  streak: number,
  milestones: readonly StreakMilestone[] = DEFAULT_STREAK_MILESTONES,
  repeat: StreakRepeat = DEFAULT_STREAK_REPEAT,
): StreakMilestone[] {
  const reached = milestones
    .filter((milestone) => milestone.atDays <= streak)
    .sort((a, b) => a.atDays - b.atDays);

  const last = milestones.reduce(
    (highest, milestone) => Math.max(highest, milestone.atDays),
    0,
  );
  const every = Math.max(0, Math.floor(repeat.everyDays));
  if (every) {
    for (let day = last + every; day <= streak; day += every) {
      reached.push({
        atDays: day,
        flies: repeat.flies,
        giftItemId: repeat.giftItemId || undefined,
        shields: repeat.shields || undefined,
      });
    }
  }
  return reached;
}

/**
 * What the task pays if it is completed right now: the streak rate (or its own
 * single fly) plus only the checklist markers already passed. It climbs as
 * steps are ticked, so it never promises flies that haven't been secured.
 * Milestones are deliberately excluded — they are their own one-time event.
 */
export function taskFlyWorthNow(opts: {
  checklist?: ChecklistItem[] | null;
  streak?: number;
  budgetLock?: number | null;
  tiers?: readonly StreakTier[];
}): number {
  const items = opts.checklist ?? [];
  const earned = items.length
    ? checklistPayout(items, { budgetLock: opts.budgetLock }).earned
    : 0;
  return streakFlyBase(opts.streak ?? 0, opts.tiers) + earned;
}
