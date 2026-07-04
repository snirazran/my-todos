import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import LoginStreakConfigModel, {
  LOGIN_STREAK_CONFIG_ID,
  FREEZE_CAP_MIN,
  FREEZE_CAP_MAX,
  DEFAULT_GOAL_TIERS,
  DEFAULT_MILESTONES,
} from '@/lib/models/LoginStreakConfig';
import { loadLoginStreakConfig } from '@/lib/streak/loginStreak';
import type {
  QuestAmountMode,
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';
import type { LoginStreakReward } from '@/lib/streak/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

function sanitizeReward(input: any): LoginStreakReward | null {
  if (!input) return null;

  if (input.type === 'STREAK_FREEZE') {
    const amount = Math.floor(Number(input.amount) || 1);
    if (amount < 1 || amount > 3) return null;
    return { type: 'STREAK_FREEZE', amount };
  }

  if (!VALID_REWARD_TYPES.has(input.type)) return null;

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
  } as QuestReward;
}

function sanitizeTiers(input: any): { days: number; rewards: LoginStreakReward[] }[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  const tiers: { days: number; rewards: LoginStreakReward[] }[] = [];
  for (const entry of input) {
    const days = Math.floor(Number(entry?.days));
    if (!Number.isFinite(days) || days < 2 || days > 3650 || seen.has(days)) {
      continue;
    }
    const rewards = (Array.isArray(entry?.rewards) ? entry.rewards : [])
      .map(sanitizeReward)
      .filter(Boolean) as LoginStreakReward[];
    if (rewards.length === 0) continue;
    seen.add(days);
    tiers.push({ days, rewards });
  }
  return tiers.sort((a, b) => a.days - b.days);
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await loadLoginStreakConfig();
    return NextResponse.json({
      loginStreak: {
        isActive: config.isActive,
        freezePriceFlies: config.freezePriceFlies,
        freezeCap: config.freezeCap,
        saverMinStreak: config.saverMinStreak,
        goalTiers: config.goalTiers,
        milestones: config.milestones,
        limits: { freezeCapMin: FREEZE_CAP_MIN, freezeCapMax: FREEZE_CAP_MAX },
      },
    });
  } catch (error) {
    console.error('Failed to load login streak config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load login streak config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const isActive = body?.isActive !== false;
    const freezePriceFlies = Math.max(
      1,
      Math.floor(Number(body?.freezePriceFlies) || 100),
    );
    const freezeCap = Math.min(
      FREEZE_CAP_MAX,
      Math.max(FREEZE_CAP_MIN, Math.floor(Number(body?.freezeCap) || 2)),
    );
    const saverMinStreak = Math.min(
      10,
      Math.max(1, Math.floor(Number(body?.saverMinStreak) || 2)),
    );
    const goalTiers = sanitizeTiers(body?.goalTiers);
    const milestones = sanitizeTiers(body?.milestones);

    await connectMongo();
    await LoginStreakConfigModel.findOneAndUpdate(
      { configId: LOGIN_STREAK_CONFIG_ID },
      {
        $set: {
          isActive,
          freezePriceFlies,
          freezeCap,
          saverMinStreak,
          goalTiers: goalTiers.length > 0 ? goalTiers : DEFAULT_GOAL_TIERS,
          milestones: milestones.length > 0 ? milestones : DEFAULT_MILESTONES,
        },
      },
      { new: true, upsert: true },
    ).lean();

    const config = await loadLoginStreakConfig();
    return NextResponse.json({
      loginStreak: {
        isActive: config.isActive,
        freezePriceFlies: config.freezePriceFlies,
        freezeCap: config.freezeCap,
        saverMinStreak: config.saverMinStreak,
        goalTiers: config.goalTiers,
        milestones: config.milestones,
        limits: { freezeCapMin: FREEZE_CAP_MIN, freezeCapMax: FREEZE_CAP_MAX },
      },
    });
  } catch (error) {
    console.error('Failed to save login streak config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save login streak config',
      },
      { status: 400 },
    );
  }
}
