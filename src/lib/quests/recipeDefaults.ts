import { v4 as uuid } from 'uuid';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';

function slot(
  pool: Array<{
    type: 'count' | 'focus_minutes' | 'metric_count';
    action?: 'complete' | 'add';
    metricKey?: string;
    streakDaysMin?: number;
    streakDaysMax?: number;
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

// Focus ladder: 6 objectives over 3 days, tag-scoped to the focus category.
// Targets are cumulative thresholds calibrated to ~3-5 tagged completions or
// ~30-40 tagged focus minutes per day. Free payout: 2+2+3+3+5+8 = 23 flies
// plus a guaranteed gift on the capstone; premium doubles at claim time.
export async function ensureDefaultQuestRecipe(): Promise<QuestRecipeDoc | null> {
  await ensureDefaultDailyRecipe();
  const existing = await QuestRecipeModel.findOne({
    placement: { $ne: 'daily' },
  }).lean<QuestRecipeDoc>();
  if (existing) return existing;
  const created = await QuestRecipeModel.create({
    recipeId: 'default',
    name: 'Focus Ladder',
    placement: 'category',
    isActive: true,
    durationMinutes: 3 * 24 * 60,
    categoryIds: [],
    slots: [
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 2, maxTarget: 3, weight: 3 },
          { type: 'count', action: 'add', minTarget: 2, maxTarget: 3, weight: 2 },
          { type: 'focus_minutes', minTarget: 10, maxTarget: 15, weight: 2 },
        ],
        flies(2),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 3, maxTarget: 4, weight: 3 },
          { type: 'focus_minutes', minTarget: 20, maxTarget: 25, weight: 2 },
        ],
        flies(2),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 5, maxTarget: 6, weight: 3 },
          { type: 'focus_minutes', minTarget: 30, maxTarget: 40, weight: 2 },
        ],
        flies(3),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 7, maxTarget: 8, weight: 3 },
          { type: 'focus_minutes', minTarget: 45, maxTarget: 60, weight: 2 },
          { type: 'metric_count', metricKey: 'buddy_task_completed', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(3),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 9, maxTarget: 11, weight: 3 },
          { type: 'focus_minutes', minTarget: 70, maxTarget: 90, weight: 2 },
          {
            type: 'metric_count',
            metricKey: 'task_streak_2',
            streakDaysMin: 2,
            streakDaysMax: 2,
            minTarget: 1,
            maxTarget: 1,
            weight: 1,
          },
        ],
        flies(5),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 12, maxTarget: 15, weight: 3 },
          { type: 'focus_minutes', minTarget: 100, maxTarget: 120, weight: 2 },
        ],
        flies(8),
        giftBonus(1),
      ),
    ],
  });
  return created.toObject() as QuestRecipeDoc;
}

// Daily roll: 3 objectives, easy -> medium -> hard, all achievable by a
// day-one user (no economy-loop metrics like trades or sales). Free payout:
// 2+3+5 = 10 flies plus a 15% gift roll on the capstone.
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
    durationMinutes: 24 * 60,
    categoryIds: [],
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
          { type: 'metric_count', metricKey: 'task_saved_later', minTarget: 1, maxTarget: 1, weight: 1 },
          { type: 'metric_count', metricKey: 'skin_equipped', minTarget: 1, maxTarget: 1, weight: 1 },
        ],
        flies(3),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 7, maxTarget: 9, weight: 3 },
          { type: 'focus_minutes', minTarget: 30, maxTarget: 40, weight: 3 },
        ],
        flies(5),
        giftBonus(0.15),
      ),
    ],
  });
}
