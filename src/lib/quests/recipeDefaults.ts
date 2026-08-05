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

// Focus ladder: 6 objectives over 3 days, tag-scoped to the focus category.
// Each tier is a different verb — plan, do, repeat, deepen, sustain, exceed —
// so the ladder asks for something instead of watching one counter pass six
// marks. The roll lives inside a tier, between variants of that tier's verb.
// Targets are authored for ~4 tagged completions or ~35 tagged focus minutes a
// day and scale to the user's own trailing rate at roll time. Free payout:
// 2+2+3+3+5+8 = 23 flies plus a guaranteed gift on the capstone; premium
// doubles at claim time.
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
      // Plan — the on-ramp. Credited on the add, paid on the finish, so it
      // recruits the planning a user already does instead of paying for typing.
      slot(
        [
          {
            type: 'count',
            action: 'add',
            requiresFollowThrough: true,
            minTarget: 2,
            maxTarget: 3,
            weight: 3,
          },
          { type: 'count', action: 'complete', minTarget: 2, maxTarget: 3, weight: 2 },
        ],
        flies(2),
      ),
      // Do — plain volume, the one tier that should be easy to read.
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 3, maxTarget: 4, weight: 3 },
          { type: 'focus_minutes', minTarget: 20, maxTarget: 25, weight: 2 },
        ],
        flies(2),
      ),
      // Repeat — two separate days beats one heroic afternoon, and volume
      // cannot tick this one.
      slot(
        [
          { type: 'distinct_days', minTarget: 2, maxTarget: 2, weight: 3 },
          { type: 'count', action: 'complete', beforeHour: 12, minTarget: 1, maxTarget: 2, weight: 2 },
        ],
        flies(3),
      ),
      // Deepen — one unbroken sitting, which accumulated focus minutes cannot
      // express.
      slot(
        [
          { type: 'deep_session', sessionMinutes: 25, minTarget: 1, maxTarget: 1, weight: 3 },
          { type: 'focus_minutes', minTarget: 45, maxTarget: 60, weight: 2 },
        ],
        flies(3),
      ),
      // Sustain — the habit itself. Screened at roll time so it only appears
      // for someone holding a repeating task that can carry it.
      slot(
        [
          {
            type: 'metric_count',
            metricKey: 'task_streak_3',
            streakDaysMin: 3,
            streakDaysMax: 3,
            minTarget: 1,
            maxTarget: 1,
            weight: 3,
          },
          { type: 'distinct_days', minTarget: 3, maxTarget: 3, weight: 2 },
        ],
        flies(5),
      ),
      // Exceed — the capstone, and the only tier that asks for real volume.
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
