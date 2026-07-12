import { v4 as uuid } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipeBonusReward,
  type RecipePoolEntry,
  type RecipeSlot,
} from '@/lib/models/QuestRecipe';
import { ensureDefaultQuestRecipe } from '@/lib/quests/recipeDefaults';
import { isValidQuestMetricKey } from '@/lib/quests/metrics';
import { sanitizeRewards } from '@/app/api/admin/quests/route';
import {
  isCoverDataUrl,
  isCoverProxyUrl,
  uploadCoverFromDataUrl,
} from '@/lib/quests/coverStorage';

const VALID_POOL_TYPES = new Set(['count', 'focus_minutes', 'metric_count']);

function sanitizePoolEntry(input: any): RecipePoolEntry | null {
  if (!input || !VALID_POOL_TYPES.has(input.type)) return null;
  const minTarget = Math.floor(Number(input.minTarget));
  if (!Number.isFinite(minTarget) || minTarget <= 0) return null;
  const rawMax = Math.floor(Number(input.maxTarget));
  const maxTarget =
    Number.isFinite(rawMax) && rawMax >= minTarget ? rawMax : minTarget;
  const rawWeight = Math.floor(Number(input.weight));
  const entry: RecipePoolEntry = {
    id:
      typeof input.id === 'string' && input.id.trim() ? input.id.trim() : uuid(),
    type: input.type,
    minTarget,
    maxTarget,
    weight: Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1,
  };
  if (entry.type === 'count') {
    entry.action = input.action === 'add' ? 'add' : 'complete';
  }
  if (entry.type === 'metric_count') {
    if (!isValidQuestMetricKey(input.metricKey)) return null;
    entry.metricKey = input.metricKey;
    if (input.metricKey.startsWith('task_streak')) {
      const rawDaysMin = Math.floor(Number(input.streakDaysMin));
      const daysMin =
        Number.isFinite(rawDaysMin) && rawDaysMin >= 2
          ? Math.min(60, rawDaysMin)
          : 3;
      const rawDaysMax = Math.floor(Number(input.streakDaysMax));
      const daysMax =
        Number.isFinite(rawDaysMax) && rawDaysMax >= daysMin
          ? Math.min(60, rawDaysMax)
          : daysMin;
      entry.streakDaysMin = daysMin;
      entry.streakDaysMax = daysMax;
    }
  }
  return entry;
}

function sanitizeBonusReward(input: any): RecipeBonusReward | null {
  if (!input || typeof input !== 'object') return null;
  const reward = sanitizeRewards([input.reward])[0];
  const chance = Number(input.chance);
  if (!reward || !Number.isFinite(chance) || chance <= 0) return null;
  return { chance: Math.min(1, chance), reward };
}

function sanitizeSlot(input: any): RecipeSlot | null {
  if (!input || typeof input !== 'object') return null;
  const pool = Array.isArray(input.pool)
    ? (input.pool.map(sanitizePoolEntry).filter(Boolean) as RecipePoolEntry[])
    : [];
  const rewards = sanitizeRewards(input.rewards);
  if (pool.length === 0 || rewards.length === 0) return null;
  const bonusRewards = Array.isArray(input.bonusRewards)
    ? (input.bonusRewards
        .map(sanitizeBonusReward)
        .filter(Boolean) as RecipeBonusReward[])
    : [];
  return {
    id:
      typeof input.id === 'string' && input.id.trim() ? input.id.trim() : uuid(),
    pool,
    rewards,
    ...(bonusRewards.length > 0 ? { bonusRewards } : {}),
  };
}

function recipeToJSON(recipe: QuestRecipeDoc) {
  return {
    recipeId: recipe.recipeId,
    name: recipe.name,
    placement: recipe.placement ?? 'category',
    isActive: recipe.isActive,
    durationMinutes: recipe.durationMinutes,
    categoryIds: recipe.categoryIds ?? [],
    coverImageUrl: recipe.coverImageUrl,
    slots: recipe.slots ?? [],
  };
}

function parseRecipeBody(body: any) {
  const slots = Array.isArray(body?.slots)
    ? (body.slots.map(sanitizeSlot).filter(Boolean) as RecipeSlot[])
    : [];
  if (slots.length === 0) {
    return { error: 'Add at least one slot with a pool entry and a reward' };
  }
  const durationMinutes = Math.floor(Number(body?.durationMinutes));
  return {
    value: {
      name:
        typeof body?.name === 'string' && body.name.trim()
          ? body.name.trim()
          : 'Focus Ladder',
      placement: body?.placement === 'daily' ? ('daily' as const) : ('category' as const),
      isActive: body?.isActive !== false,
      durationMinutes:
        Number.isFinite(durationMinutes) && durationMinutes > 0
          ? durationMinutes
          : 3 * 24 * 60,
      categoryIds: Array.isArray(body?.categoryIds)
        ? body.categoryIds.filter(
            (id: unknown): id is string => typeof id === 'string' && !!id,
          )
        : [],
      slots,
    },
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    await ensureDefaultQuestRecipe();
    const recipes = await QuestRecipeModel.find()
      .sort({ createdAt: 1 })
      .lean<QuestRecipeDoc[]>();
    return NextResponse.json({ recipes: recipes.map(recipeToJSON) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const parsed = parseRecipeBody(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const recipe = await QuestRecipeModel.create({
      recipeId: uuid(),
      ...parsed.value,
    });
    return NextResponse.json({
      ok: true,
      recipe: recipeToJSON(recipe.toObject() as QuestRecipeDoc),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const recipeId =
      typeof body?.recipeId === 'string' ? body.recipeId.trim() : '';
    if (!recipeId) {
      return NextResponse.json({ error: 'recipeId required' }, { status: 400 });
    }
    const parsed = parseRecipeBody(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const updateSet: Record<string, unknown> = { ...parsed.value };
    const unsetFields: Record<string, 1> = {};
    if (isCoverDataUrl(body.coverImageUrl)) {
      const uploaded = await uploadCoverFromDataUrl(
        'recipe',
        recipeId,
        body.coverImageUrl,
      );
      if (uploaded) {
        updateSet.coverImageUrl = uploaded.url;
        updateSet.coverImageFile = uploaded.file;
      }
    } else if (!isCoverProxyUrl(body.coverImageUrl)) {
      unsetFields.coverImageUrl = 1;
      unsetFields.coverImageFile = 1;
    }
    const recipe = await QuestRecipeModel.findOneAndUpdate(
      { recipeId },
      {
        $set: updateSet,
        ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
      },
      { new: true },
    ).lean<QuestRecipeDoc>();
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, recipe: recipeToJSON(recipe) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const recipeId =
      typeof body?.recipeId === 'string' ? body.recipeId.trim() : '';
    if (!recipeId) {
      return NextResponse.json({ error: 'recipeId required' }, { status: 400 });
    }
    await QuestRecipeModel.deleteOne({ recipeId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
