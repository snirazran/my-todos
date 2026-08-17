import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestStreakConfigModel, {
  STREAK_CONFIG_ID,
  SWEEP_DEFAULTS,
  SWEEP_GOLDEN_MAX,
  SWEEP_GOLDEN_MIN,
  SWEEP_MAX_FLIES,
  SWEEP_MEGA_MAX,
  type QuestStreakConfigDoc,
  type SweepReward,
  type SweepRollEntry,
} from '@/lib/models/QuestStreakConfig';
import {
  clampGoldenEveryDays,
  clampMegaEveryDays,
  normalizeSweepConfig,
} from '@/lib/quests/streak';
import type { PactRarity } from '@/lib/pact/types';
import type { QuestAmountMode, QuestReward, QuestRewardType } from '@/lib/quests/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);
const RARITIES: PactRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

function sanitizeQuestReward(input: any): QuestReward | null {
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
    return {
      type: 'FLIES',
      amountMode,
      amount: Math.min(SWEEP_MAX_FLIES, Math.floor(amount)),
    };
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

/**
 * The roll tables carry two outcomes the plain quest vocabulary cannot express,
 * so they are whitelisted here rather than passed through — an unknown `type`
 * reaching the draw would pay nothing and read as a bug in the odds.
 */
function sanitizeSweepReward(input: any): SweepReward | null {
  const type = String(input?.type ?? '');
  if (type === 'SHIELD') {
    return {
      type: 'SHIELD',
      amount: Math.min(5, Math.max(1, Math.floor(Number(input?.amount) || 1))),
    };
  }
  if (type === 'RARITY_ITEM') {
    // An itemId pins the tier to one outfit; without it the tier is drawn.
    const itemId =
      typeof input?.itemId === 'string' && input.itemId.trim()
        ? input.itemId.trim()
        : undefined;
    return {
      type: 'RARITY_ITEM',
      rarity: RARITIES.includes(input?.rarity) ? input.rarity : 'epic',
      amount: Math.min(5, Math.max(1, Math.floor(Number(input?.amount) || 1))),
      ...(itemId ? { itemId } : {}),
    };
  }
  return sanitizeQuestReward(input);
}

function sanitizeRollTable(raw: unknown): SweepRollEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any, index: number): SweepRollEntry | null => {
      const reward = sanitizeSweepReward(entry?.reward);
      if (!reward) return null;
      const chance = Number(entry?.chance);
      if (!Number.isFinite(chance) || chance <= 0) return null;
      return {
        id:
          typeof entry?.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : `entry-${index}`,
        // Two decimals: the shipped tables use 1.5% and 0.5%.
        chance: Math.min(100, Math.round(chance * 100) / 100),
        reward,
      };
    })
    .filter((entry): entry is SweepRollEntry => !!entry)
    .slice(0, 20);
}

function configToView(config: QuestStreakConfigDoc | null) {
  const normalized = normalizeSweepConfig(config);
  return {
    ...normalized,
    limits: {
      goldenMin: SWEEP_GOLDEN_MIN,
      goldenMax: SWEEP_GOLDEN_MAX,
      megaMax: SWEEP_MEGA_MAX,
      maxFlies: SWEEP_MAX_FLIES,
    },
    defaults: SWEEP_DEFAULTS,
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await QuestStreakConfigModel.findOne({
      configId: STREAK_CONFIG_ID,
    }).lean<QuestStreakConfigDoc | null>();
    return NextResponse.json({ sweep: configToView(config) });
  } catch (error) {
    console.error('Failed to load sweep config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load sweep config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const isActive = body?.isActive === true;
    const cleanSweepFlies = Math.min(
      SWEEP_MAX_FLIES,
      Math.max(0, Math.floor(Number(body?.cleanSweepFlies) || 0)),
    );
    const goldenEveryDays = clampGoldenEveryDays(Number(body?.goldenEveryDays));
    const megaEveryDays = clampMegaEveryDays(Number(body?.megaEveryDays));
    const standardRoll = sanitizeRollTable(body?.standardRoll);
    const goldenRoll = sanitizeRollTable(body?.goldenRoll);
    const megaRewards = (Array.isArray(body?.megaRewards) ? body.megaRewards : [])
      .map(sanitizeSweepReward)
      .filter(Boolean)
      .slice(0, 10) as SweepReward[];

    if (isActive && standardRoll.length === 0) {
      return NextResponse.json(
        { error: 'The standard roll needs at least one outcome' },
        { status: 400 },
      );
    }
    if (isActive && goldenEveryDays > 0 && goldenRoll.length === 0) {
      return NextResponse.json(
        { error: 'The golden roll needs at least one outcome' },
        { status: 400 },
      );
    }

    await connectMongo();
    const config = await QuestStreakConfigModel.findOneAndUpdate(
      { configId: STREAK_CONFIG_ID },
      {
        $set: {
          isActive,
          cleanSweepFlies,
          goldenEveryDays,
          megaEveryDays,
          megaRewards,
          standardRoll,
          goldenRoll,
        },
      },
      { new: true, upsert: true },
    ).lean<QuestStreakConfigDoc | null>();

    return NextResponse.json({ sweep: configToView(config) });
  } catch (error) {
    console.error('Failed to save sweep config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to save sweep config',
      },
      { status: 400 },
    );
  }
}
