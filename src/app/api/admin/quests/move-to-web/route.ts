import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestMoveToWebConfigModel, {
  MOVE_TO_WEB_CONFIG_ID,
} from '@/lib/models/QuestMoveToWebConfig';
import type {
  QuestAmountMode,
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

function sanitizeReward(input: any): QuestReward | null {
  if (!input || !VALID_REWARD_TYPES.has(input.type)) return null;

  if (input.type === 'FLIES') {
    const amountMode = VALID_AMOUNT_MODES.has(input.amountMode)
      ? input.amountMode
      : 'fixed';
    if (amountMode === 'random') {
      const minAmount = Number(input.minAmount);
      const maxAmount = Number(input.maxAmount);
      if (
        !Number.isFinite(minAmount) ||
        !Number.isFinite(maxAmount) ||
        minAmount <= 0 ||
        maxAmount < minAmount
      ) {
        return null;
      }
      return {
        type: 'FLIES',
        amountMode,
        minAmount: Math.floor(minAmount),
        maxAmount: Math.floor(maxAmount),
      };
    }
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { type: 'FLIES', amountMode, amount: Math.floor(amount) };
  }

  if (input.type === 'BACKGROUND') {
    if (typeof input.backgroundId !== 'string' || !input.backgroundId.trim()) {
      return null;
    }
    return { type: 'BACKGROUND', backgroundId: input.backgroundId.trim() };
  }

  if (typeof input.itemId !== 'string' || !input.itemId.trim()) return null;
  return {
    type: input.type,
    itemId: input.itemId.trim(),
    amount:
      input.type === 'BOX'
        ? Math.max(1, Math.floor(Number(input.amount) || 1))
        : undefined,
  };
}

function configToView(
  config: { isActive?: boolean; reward?: QuestReward | null } | null,
) {
  return {
    isActive: config?.isActive ?? false,
    reward: config?.reward ?? null,
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await QuestMoveToWebConfigModel.findOne({
      configId: MOVE_TO_WEB_CONFIG_ID,
    }).lean();
    return NextResponse.json({ moveToWeb: configToView(config) });
  } catch (error) {
    console.error('Failed to load move-to-web config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load move-to-web config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const reward = sanitizeReward(body?.reward);
    const isActive = body?.isActive === true;

    if (isActive && !reward) {
      return NextResponse.json(
        { error: 'Pick a prize before activating the quest' },
        { status: 400 },
      );
    }

    await connectMongo();
    const config = await QuestMoveToWebConfigModel.findOneAndUpdate(
      { configId: MOVE_TO_WEB_CONFIG_ID },
      { $set: { isActive, reward } },
      { new: true, upsert: true },
    ).lean();

    return NextResponse.json({ moveToWeb: configToView(config) });
  } catch (error) {
    console.error('Failed to save move-to-web config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save move-to-web config',
      },
      { status: 400 },
    );
  }
}
