import { v4 as uuid } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestTemplateModel from '@/lib/models/QuestTemplate';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { templateToView } from '@/lib/quests/engine';
import type {
  QuestAmountMode,
  QuestCountAction,
  QuestLogicBlock,
  QuestLogicType,
  QuestPlacement,
  QuestReward,
  QuestRewards,
  QuestRewardType,
  QuestSubject,
  QuestVisibilityCondition,
  QuestVisibilityMetric,
  QuestVisibilityOperator,
} from '@/lib/quests/types';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

const VALID_PLACEMENTS = new Set<QuestPlacement>(['daily', 'category']);
const VALID_LOGIC_TYPES = new Set<QuestLogicType>(['count', 'focus_minutes']);
const VALID_SUBJECTS = new Set<QuestSubject>(['task', 'any']);
const VALID_ACTIONS = new Set<QuestCountAction>(['complete', 'add']);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);
const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
]);
const VALID_VISIBILITY_METRICS = new Set<QuestVisibilityMetric>([
  'daily_tasks_count',
  'tags_count',
]);
const VALID_VISIBILITY_OPERATORS = new Set<QuestVisibilityOperator>([
  'gt',
  'lt',
]);

function sanitizeReward(input: any): QuestReward | null {
  if (!input || !VALID_REWARD_TYPES.has(input.type)) return null;
  const reward: QuestReward = { type: input.type };

  if (input.type === 'FLIES') {
    const amountMode = VALID_AMOUNT_MODES.has(input.amountMode)
      ? input.amountMode
      : 'fixed';
    reward.amountMode = amountMode;
    if (amountMode === 'fixed') {
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      reward.amount = Math.floor(amount);
    } else {
      const fallbackAmount = Number(input.amount);
      const minAmount = Number.isFinite(Number(input.minAmount))
        ? Number(input.minAmount)
        : 1;
      const maxAmount = Number.isFinite(Number(input.maxAmount))
        ? Number(input.maxAmount)
        : Number.isFinite(fallbackAmount) && fallbackAmount > 0
          ? fallbackAmount
          : NaN;
      if (
        !Number.isFinite(minAmount) ||
        !Number.isFinite(maxAmount) ||
        minAmount <= 0 ||
        maxAmount < minAmount
      ) {
        return null;
      }
      reward.minAmount = Math.floor(minAmount);
      reward.maxAmount = Math.floor(maxAmount);
    }
  }

  if (input.type === 'ITEM' || input.type === 'BOX') {
    if (typeof input.itemId !== 'string' || !input.itemId.trim()) return null;
    reward.itemId = input.itemId.trim();
  }

  return reward;
}

function sanitizeRewards(input: any): QuestRewards {
  const rewards = Array.isArray(input)
    ? input.map(sanitizeReward).filter(Boolean)
    : [];
  return rewards as QuestReward[];
}

function sanitizeLogicBlock(input: any): QuestLogicBlock | null {
  if (!input || !VALID_LOGIC_TYPES.has(input.type)) return null;
  if (!VALID_SUBJECTS.has(input.subject)) return null;
  if (!VALID_AMOUNT_MODES.has(input.amountMode)) return null;

  const block: QuestLogicBlock = {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : uuid(),
    type: input.type,
    subject: input.subject,
    amountMode: input.amountMode,
    tagMode:
      input.tagMode === 'random_user_tag'
        ? 'random_user_tag'
        : input.tagMode === 'focus_category_tags'
          ? 'focus_category_tags'
          : 'ignore',
  };

  if (block.type === 'count') {
    if (!VALID_ACTIONS.has(input.action)) return null;
    block.action = input.action;
  } else {
    block.subject = 'task';
  }

  if (block.amountMode === 'fixed') {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    block.amount = Math.floor(amount);
  } else {
    const fallbackAmount = Number(input.amount);
    const minAmount = Number.isFinite(Number(input.minAmount))
      ? Number(input.minAmount)
      : 1;
    const maxAmount = Number.isFinite(Number(input.maxAmount))
      ? Number(input.maxAmount)
      : Number.isFinite(fallbackAmount) && fallbackAmount > 0
        ? fallbackAmount
        : NaN;
    if (
      !Number.isFinite(minAmount) ||
      !Number.isFinite(maxAmount) ||
      minAmount <= 0 ||
      maxAmount < minAmount
    ) {
      return null;
    }
    block.minAmount = Math.floor(minAmount);
    block.maxAmount = Math.floor(maxAmount);
  }

  if (Array.isArray(input.rewards) && input.rewards.length > 0) {
    const rewards = sanitizeRewards(input.rewards);
    if (rewards.length > 0) block.rewards = rewards;
  }

  return block;
}

function sanitizeVisibilityCondition(input: any): QuestVisibilityCondition | null {
  if (!input || !VALID_VISIBILITY_METRICS.has(input.metric)) return null;
  if (!VALID_VISIBILITY_OPERATORS.has(input.operator)) return null;

  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) return null;

  return {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : uuid(),
    metric: input.metric,
    operator: input.operator,
    value: Math.floor(value),
  };
}

function sanitizeDurationMinutes(input: any) {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.min(Math.floor(numeric), 525_600);
}

function sanitizeTemplateBody(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description.trim() : '';
  const placement = body?.placement as QuestPlacement;
  const categoryId =
    typeof body?.categoryId === 'string' && body.categoryId.trim()
      ? body.categoryId.trim()
      : undefined;
  const coverImageUrl =
    typeof body?.coverImageUrl === 'string' && body.coverImageUrl.startsWith('data:image/')
      ? body.coverImageUrl
      : undefined;
  const logic = Array.isArray(body?.logic)
    ? body.logic.map(sanitizeLogicBlock).filter(Boolean)
    : [];
  const visibilityConditions = Array.isArray(body?.visibilityConditions)
    ? body.visibilityConditions.map(sanitizeVisibilityCondition).filter(Boolean)
    : [];
  const isActive = body?.isActive !== false;
  const durationMinutes = sanitizeDurationMinutes(body?.durationMinutes);

  if (!name) return { error: 'Quest name is required' };
  if (!VALID_PLACEMENTS.has(placement)) return { error: 'Invalid placement' };
  if (placement === 'category' && !categoryId) {
    return { error: 'A category quest needs a valid category' };
  }
  if (!logic.length) return { error: 'Add at least one logic block' };
  if ((logic as QuestLogicBlock[]).some((b) => !(b.rewards?.length ?? 0))) {
    return { error: 'Each objective needs at least one reward' };
  }

  const normalizedLogic: QuestLogicBlock[] = (logic as QuestLogicBlock[]).map(
    (block): QuestLogicBlock => {
      if (placement === 'category') {
        return { ...block, tagMode: 'focus_category_tags' as const };
      }

      return block.tagMode !== 'focus_category_tags'
        ? block
        : { ...block, tagMode: 'ignore' as const };
    },
  );

  return {
    payload: {
      name,
      description,
      placement,
      categoryId: placement === 'category' ? categoryId : undefined,
      durationMinutes: placement === 'category' ? durationMinutes : undefined,
      coverImageUrl,
      logic: normalizedLogic,
      visibilityConditions: visibilityConditions as QuestVisibilityCondition[],
      isActive,
    },
  };
}

async function categoryExists(categoryId: string | undefined) {
  if (!categoryId) return false;
  return !!(await QuestCategoryModel.exists({ categoryId }));
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const templates = await QuestTemplateModel.find({}).lean();
    templates.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return json({ templates: templates.map(templateToView) });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const sanitized = sanitizeTemplateBody(body);
    if ('error' in sanitized) return json({ error: sanitized.error }, 400);

    await connectMongo();
    if (
      sanitized.payload.placement === 'category' &&
      !(await categoryExists(sanitized.payload.categoryId))
    ) {
      return json({ error: 'A category quest needs a valid category' }, 400);
    }
    const template = await QuestTemplateModel.create({
      templateId: uuid(),
      ...sanitized.payload,
    });

    return json({ ok: true, template: templateToView(template) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create quest' },
      400,
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const templateId =
      typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : '';
    if (!templateId) return json({ error: 'Missing template id' }, 400);

    const sanitized = sanitizeTemplateBody(body);
    if ('error' in sanitized) return json({ error: sanitized.error }, 400);

    await connectMongo();
    if (
      sanitized.payload.placement === 'category' &&
      !(await categoryExists(sanitized.payload.categoryId))
    ) {
      return json({ error: 'A category quest needs a valid category' }, 400);
    }
    const updateSet = {
      ...sanitized.payload,
    };
    const unsetFields: Record<string, 1> = {};

    if (!sanitized.payload.coverImageUrl) {
      delete updateSet.coverImageUrl;
      unsetFields.coverImageUrl = 1;
    }

    if (!sanitized.payload.categoryId) {
      delete updateSet.categoryId;
      unsetFields.categoryId = 1;
    }

    if (!sanitized.payload.durationMinutes) {
      delete updateSet.durationMinutes;
      unsetFields.durationMinutes = 1;
    }

    const template = await QuestTemplateModel.findOneAndUpdate(
      { templateId },
      {
        $set: updateSet,
        ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
      },
      { new: true },
    );
    if (!template) return json({ error: 'Quest template not found' }, 404);

    return json({ ok: true, template: templateToView(template) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to update quest' },
      400,
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const templateId =
      typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : '';
    if (!templateId) return json({ error: 'Missing template id' }, 400);

    await connectMongo();
    await QuestTemplateModel.deleteOne({ templateId });
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
