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
      | 'deep_session';
    action?: 'complete' | 'add';
    metricKey?: string;
    streakDaysMin?: number;
    streakDaysMax?: number;
    sessionMinutes?: number;
    requiresFollowThrough?: boolean;
    beforeHour?: number;
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

const giftBonus = (chance: number) => [
  {
    chance,
    reward: { type: 'BOX' as const, itemId: 'gift_box_1' },
  },
];

// Daily roll: 3 objectives, easy -> medium -> hard. Economy-loop metrics
// (trade/sell/acquire) are in the pools but the engine only rolls them for
// users who can actually perform them today (see isPoolEntryEligible), so a
// day-one user never sees a dead objective. Free payout: 2+3+5 = 10 flies
// plus a 15% gift roll on the capstone.
export async function ensureDefaultDailyRecipe(): Promise<void> {
  const existing = await QuestRecipeModel.findOne({
    placement: 'daily',
  }).lean<QuestRecipeDoc>();
  if (existing) return;
  await QuestRecipeModel.create({
    recipeId: 'default-daily',
    name: 'Daily Roll',
    placement: 'daily',
    isActive: false,
    slots: [
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 2, maxTarget: 3, weight: 3 },
          { type: 'count', action: 'add', minTarget: 2, maxTarget: 3, weight: 2 },
          { type: 'focus_minutes', minTarget: 10, maxTarget: 15, weight: 2 },
          { type: 'metric_count', metricKey: 'frog_fed_full', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(2),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 4, maxTarget: 6, weight: 3 },
          { type: 'focus_minutes', minTarget: 15, maxTarget: 25, weight: 3 },
          { type: 'deep_session', sessionMinutes: 25, minTarget: 1, maxTarget: 1, weight: 2 },
          { type: 'count', action: 'complete', beforeHour: 12, minTarget: 2, maxTarget: 3, weight: 2 },
          { type: 'metric_count', metricKey: 'skin_acquired', minTarget: 1, maxTarget: 1, weight: 1 },
          { type: 'metric_count', metricKey: 'skin_sold', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(3),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 7, maxTarget: 9, weight: 3 },
          { type: 'focus_minutes', minTarget: 30, maxTarget: 40, weight: 3 },
          { type: 'metric_count', metricKey: 'trade_completed', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(5),
        giftBonus(0.15),
      ),
    ],
  });
}
