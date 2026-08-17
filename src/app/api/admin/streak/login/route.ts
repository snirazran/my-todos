import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import LoginStreakConfigModel, {
  LOGIN_STREAK_CONFIG_ID,
  DEFAULT_GOAL_TIERS,
  DEFAULT_REPEAT_PAYOUT_PERCENTS,
  DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT,
} from '@/lib/models/LoginStreakConfig';
import { loadLoginStreakConfig } from '@/lib/streak/loginStreak';
import type {
  QuestAmountMode,
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';
import type { LoginStreakReward, SkinRarity } from '@/lib/streak/types';

const VALID_RARITIES = new Set<SkinRarity>([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);

function sanitizeRepeatPercents(input: any): number[] {
  if (!Array.isArray(input)) return [...DEFAULT_REPEAT_PAYOUT_PERCENTS];
  const percents = input
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 100)
    .slice(0, 10);
  return percents.length > 0 ? percents : [...DEFAULT_REPEAT_PAYOUT_PERCENTS];
}

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

function sanitizeReward(input: any): LoginStreakReward | null {
  if (!input) return null;

  // `STREAK_FREEZE` is what tiers authored before the shield merge still say.
  if (input.type === 'SHIELD' || input.type === 'STREAK_FREEZE') {
    const amount = Math.floor(Number(input.amount) || 1);
    if (amount < 1 || amount > 3) return null;
    return { type: 'SHIELD', amount };
  }

  if (input.type === 'SKIN_ROLL') {
    const minRarity = VALID_RARITIES.has(input.minRarity)
      ? (input.minRarity as SkinRarity)
      : 'rare';
    return { type: 'SKIN_ROLL', minRarity };
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
        saverMinStreak: config.saverMinStreak,
        repeatPayoutPercents: config.repeatPayoutPercents,
        repeatPayoutFloorPercent: config.repeatPayoutFloorPercent,
        repeatItemsAtFullOnly: config.repeatItemsAtFullOnly,
        goalTiers: config.goalTiers,
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
    const saverMinStreak = Math.min(
      10,
      Math.max(1, Math.floor(Number(body?.saverMinStreak) || 2)),
    );
    const goalTiers = sanitizeTiers(body?.goalTiers);
    const repeatPayoutPercents = sanitizeRepeatPercents(
      body?.repeatPayoutPercents,
    );
    const repeatPayoutFloorPercent = Math.min(
      100,
      Math.max(
        1,
        Math.floor(
          Number(body?.repeatPayoutFloorPercent) ||
            DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT,
        ),
      ),
    );
    const repeatItemsAtFullOnly = body?.repeatItemsAtFullOnly !== false;

    await connectMongo();
    await LoginStreakConfigModel.findOneAndUpdate(
      { configId: LOGIN_STREAK_CONFIG_ID },
      {
        $set: {
          isActive,
          saverMinStreak,
          repeatPayoutPercents,
          repeatPayoutFloorPercent,
          repeatItemsAtFullOnly,
          goalTiers: goalTiers.length > 0 ? goalTiers : DEFAULT_GOAL_TIERS,
        },
        $unset: { milestones: '', freezePriceFlies: '', freezeCap: '' },
      },
      { new: true, upsert: true },
    ).lean();

    const config = await loadLoginStreakConfig();
    return NextResponse.json({
      loginStreak: {
        isActive: config.isActive,
        saverMinStreak: config.saverMinStreak,
        repeatPayoutPercents: config.repeatPayoutPercents,
        repeatPayoutFloorPercent: config.repeatPayoutFloorPercent,
        repeatItemsAtFullOnly: config.repeatItemsAtFullOnly,
        goalTiers: config.goalTiers,
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
