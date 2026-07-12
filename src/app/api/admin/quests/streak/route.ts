import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestStreakConfigModel, {
  STREAK_CONFIG_ID,
  STREAK_LENGTH_MIN,
  STREAK_LENGTH_MAX,
} from '@/lib/models/QuestStreakConfig';
import { clampStreakLength } from '@/lib/quests/streak';
import type { QuestAmountMode, QuestReward, QuestRewardType } from '@/lib/quests/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

function sanitizeReward(input: any): QuestReward | null {
  const reward = sanitizeRewardBase(input);
  if (!reward) return null;
  const weight = Math.floor(Number(input.weight));
  if (Number.isFinite(weight) && weight >= 1) {
    reward.weight = Math.min(100, weight);
  }
  return reward;
}

function sanitizeRewardBase(input: any): QuestReward | null {
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

function configToView(config: {
  isActive?: boolean;
  streakLength?: number;
  rewards?: QuestReward[];
} | null) {
  return {
    isActive: config?.isActive ?? false,
    streakLength: clampStreakLength(config?.streakLength ?? 5),
    rewards: config?.rewards ?? [],
    limits: { min: STREAK_LENGTH_MIN, max: STREAK_LENGTH_MAX },
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await QuestStreakConfigModel.findOne({
      configId: STREAK_CONFIG_ID,
    }).lean();
    return NextResponse.json({ streak: configToView(config) });
  } catch (error) {
    console.error('Failed to load streak config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load streak config' },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const streakLength = clampStreakLength(Number(body?.streakLength) || 5);
    const rewards = (Array.isArray(body?.rewards) ? body.rewards : [])
      .map(sanitizeReward)
      .filter(Boolean) as QuestReward[];
    const isActive = body?.isActive === true;

    if (isActive && rewards.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one prize before activating the streak' },
        { status: 400 },
      );
    }

    await connectMongo();
    const config = await QuestStreakConfigModel.findOneAndUpdate(
      { configId: STREAK_CONFIG_ID },
      { $set: { isActive, streakLength, rewards } },
      { new: true, upsert: true },
    ).lean();

    return NextResponse.json({ streak: configToView(config) });
  } catch (error) {
    console.error('Failed to save streak config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save streak config' },
      { status: 400 },
    );
  }
}
