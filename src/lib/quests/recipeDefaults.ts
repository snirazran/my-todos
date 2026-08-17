import { v4 as uuid } from 'uuid';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';

function slot(
  pool: Array<{
    type:
      | 'count'
      | 'focus_minutes'
      | 'metric_count'
      | 'distinct_days'
      | 'deep_session'
      | 'day_parts';
    action?: 'complete' | 'add';
    metricKey?: string;
    streakDaysMin?: number;
    streakDaysMax?: number;
    sessionMinutes?: number;
    requiresFollowThrough?: boolean;
    beforeHour?: number;
    scaleFromHistory?: boolean;
    scaleFactor?: number;
    minTarget: number;
    maxTarget: number;
    weight?: number;
  }>,
  rewards: RecipeSlot['rewards'],
  bonusRewards?: RecipeSlot['bonusRewards'],
): RecipeSlot {
  return {
    id: uuid(),
    pool: pool.map((entry) => ({
      id: uuid(),
      type: entry.type,
      action: entry.action,
      metricKey: entry.metricKey,
      streakDaysMin: entry.streakDaysMin,
      streakDaysMax: entry.streakDaysMax,
      sessionMinutes: entry.sessionMinutes,
      requiresFollowThrough: entry.requiresFollowThrough,
      beforeHour: entry.beforeHour,
      scaleFromHistory: entry.scaleFromHistory,
      scaleFactor: entry.scaleFactor,
      minTarget: entry.minTarget,
      maxTarget: entry.maxTarget,
      weight: Math.max(1, entry.weight ?? 1),
    })),
    rewards,
    ...(bonusRewards?.length ? { bonusRewards } : {}),
  };
}

const flies = (amount: number) => [
  {
    type: 'FLIES' as const,
    amountMode: 'fixed' as const,
    amount,
  },
];

// Daily roll: 3 objectives, one per job in the day — start now, come back
// later, close the day — rather than one per difficulty tier. Slot order still
// drives which slot claims a shape first, so the cheap starters carry the
// weight in slot 1 and the volume ask is left for slot 3.
//
// Finishing all three is a Clean Sweep, which pays its own bonus and a Reward
// Roll on top (see lib/quests/streak.ts).
export async function ensureDefaultDailyRecipe(): Promise<void> {
  const existing = await QuestRecipeModel.findOne({
    placement: 'daily',
  }).lean<QuestRecipeDoc>();
  if (existing) return;
  await QuestRecipeModel.create({
    recipeId: 'default-daily',
    name: 'Daily Roll',
    placement: 'daily',
    isActive: true,
    priceByEffort: true,
    slots: [
      slot(
        [
          { type: 'count', action: 'complete', beforeHour: 12, minTarget: 2, maxTarget: 3, weight: 4 },
          { type: 'count', action: 'add', minTarget: 2, maxTarget: 3, weight: 3 },
          { type: 'count', action: 'complete', minTarget: 2, maxTarget: 3, weight: 2, scaleFromHistory: true, scaleFactor: 0.5 },
        ],
        flies(6),
      ),
      slot(
        [
          { type: 'day_parts', minTarget: 2, maxTarget: 2, weight: 4 },
          { type: 'focus_minutes', minTarget: 15, maxTarget: 25, weight: 3 },
          { type: 'deep_session', sessionMinutes: 25, minTarget: 1, maxTarget: 1, weight: 2 },
          { type: 'metric_count', metricKey: 'frog_fed_full', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(12),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 5, maxTarget: 12, weight: 4, scaleFromHistory: true, scaleFactor: 1.15 },
          { type: 'count', action: 'add', requiresFollowThrough: true, minTarget: 3, maxTarget: 4, weight: 2 },
          { type: 'day_parts', minTarget: 3, maxTarget: 3, weight: 2 },
          { type: 'focus_minutes', minTarget: 30, maxTarget: 40, weight: 2, scaleFromHistory: true, scaleFactor: 1.2 },
        ],
        flies(20),
      ),
    ],
  });
}
