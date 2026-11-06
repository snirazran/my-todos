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
      | 'day_parts'
      | 'season_step'
      | 'prompt';
    promptCategories?: string[];
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
      ...(entry.promptCategories?.length ? { promptCategories: entry.promptCategories } : {}),
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

export const DAILY_RECIPE_LAYOUT_VERSION = 2;

export function defaultDailySlots(): RecipeSlot[] {
  return [
    slot([{ type: 'count', action: 'complete', minTarget: 1, maxTarget: 1 }], flies(5)),
    slot(
      [
        { type: 'season_step', minTarget: 1, maxTarget: 1, weight: 100 },
        { type: 'count', action: 'complete', minTarget: 3, maxTarget: 3, weight: 1 },
      ],
      flies(10),
    ),
    slot([{ type: 'prompt', minTarget: 1, maxTarget: 1 }], flies(8)),
  ];
}

let layoutChecked = false;

export async function ensureDefaultDailyRecipe(): Promise<void> {
  if (layoutChecked) return;
  const existing = await QuestRecipeModel.findOne({
    placement: 'daily',
  }).lean<QuestRecipeDoc>();
  if (!existing) {
    await QuestRecipeModel.create({
      recipeId: 'default-daily',
      name: 'Daily Quests',
      placement: 'daily',
      isActive: true,
      slots: defaultDailySlots(),
      layoutVersion: DAILY_RECIPE_LAYOUT_VERSION,
    });
  } else if ((existing.layoutVersion ?? 1) < DAILY_RECIPE_LAYOUT_VERSION) {
    await QuestRecipeModel.updateOne(
      { _id: existing._id },
      {
        $set: {
          slots: defaultDailySlots(),
          layoutVersion: DAILY_RECIPE_LAYOUT_VERSION,
        },
      },
    );
  }
  layoutChecked = true;
}

export function resetDailyRecipeLayoutCheck() {
  layoutChecked = false;
}
