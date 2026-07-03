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
    minTarget: number;
    maxTarget: number;
    weight?: number;
  }>,
  rewards: RecipeSlot['rewards'],
): RecipeSlot {
  return {
    id: uuid(),
    pool: pool.map((entry) => ({
      id: uuid(),
      type: entry.type,
      action: entry.action,
      metricKey: entry.metricKey,
      minTarget: entry.minTarget,
      maxTarget: entry.maxTarget,
      weight: Math.max(1, entry.weight ?? 1),
    })),
    rewards,
  };
}

const flies = (min: number, max: number) => [
  {
    type: 'FLIES' as const,
    amountMode: 'random' as const,
    minAmount: min,
    maxAmount: max,
  },
];

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
          { type: 'count', action: 'complete', minTarget: 4, maxTarget: 6 },
          { type: 'focus_minutes', minTarget: 20, maxTarget: 30 },
        ],
        flies(10, 12),
      ),
      slot(
        [
          { type: 'focus_minutes', minTarget: 30, maxTarget: 45 },
          { type: 'count', action: 'complete', minTarget: 7, maxTarget: 10 },
        ],
        flies(15, 20),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 12, maxTarget: 18 },
          { type: 'focus_minutes', minTarget: 45, maxTarget: 60 },
        ],
        flies(25, 35),
      ),
      slot(
        [
          { type: 'focus_minutes', minTarget: 60, maxTarget: 90 },
          { type: 'count', action: 'complete', minTarget: 18, maxTarget: 25 },
          { type: 'metric_count', metricKey: 'task_streak_3', minTarget: 1, maxTarget: 1 },
        ],
        flies(40, 50),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 25, maxTarget: 35 },
          { type: 'focus_minutes', minTarget: 90, maxTarget: 120 },
        ],
        flies(60, 80),
      ),
    ],
  });
  return created.toObject() as QuestRecipeDoc;
}

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
          { type: 'count', action: 'complete', minTarget: 2, maxTarget: 4 },
          { type: 'count', action: 'add', minTarget: 2, maxTarget: 3 },
        ],
        flies(4, 6),
      ),
      slot(
        [
          { type: 'focus_minutes', minTarget: 15, maxTarget: 25 },
          { type: 'count', action: 'complete', minTarget: 5, maxTarget: 7 },
          { type: 'metric_count', metricKey: 'trade_completed', minTarget: 1, maxTarget: 1 },
        ],
        flies(8, 12),
      ),
      slot(
        [
          { type: 'count', action: 'complete', minTarget: 8, maxTarget: 12 },
          { type: 'focus_minutes', minTarget: 30, maxTarget: 45 },
          { type: 'metric_count', metricKey: 'skin_sold', minTarget: 1, maxTarget: 2 },
        ],
        flies(14, 20),
      ),
    ],
  });
}
