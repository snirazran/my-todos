import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import {
  buildSeasonPassLadder,
  createQuestSeason,
  normalizeSeasonPassConfig,
  sanitizeSeasonRewards,
  seasonToAdminView,
} from '@/lib/quests/seasons';
import { SEASON_REWARDS_PER_LANE } from '@/lib/quests/types';
import type {
  QuestAmountMode,
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'SHIELD',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

function sanitizeReward(input: any): QuestReward | null {
  if (!input || !VALID_REWARD_TYPES.has(input.type)) return null;

  if (input.type === 'SHIELD') {
    return {
      type: 'SHIELD',
      amountMode: 'fixed',
      amount: Math.max(1, Math.min(10, Math.floor(Number(input.amount) || 1))),
    };
  }

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
      amount: Math.floor(amount),
    };
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

function sanitizeTierRewards(input: unknown) {
  return sanitizeSeasonRewards(input).map((entry) => ({
    tier: entry.tier,
    freeRewards: entry.freeRewards
      .map(sanitizeReward)
      .filter(Boolean)
      .slice(0, SEASON_REWARDS_PER_LANE) as QuestReward[],
    premiumRewards: entry.premiumRewards
      .map(sanitizeReward)
      .filter(Boolean)
      .slice(0, SEASON_REWARDS_PER_LANE) as QuestReward[],
  }));
}

function sanitizeBody(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const startsAt = new Date(body?.startsAt);
  const endsAt = new Date(body?.endsAt);

  if (!name) return { error: 'Season name is required' };
  if (!Number.isFinite(startsAt.getTime())) return { error: 'Start date is required' };
  if (!Number.isFinite(endsAt.getTime())) return { error: 'End date is required' };
  if (endsAt <= startsAt) return { error: 'End date must be after start date' };

  const config = normalizeSeasonPassConfig(body);
  const authored = sanitizeTierRewards(body?.tierRewards ?? body?.dayRewards);
  const fallback = buildSeasonPassLadder(config.tierCount);
  // Every rung has to pay something on at least one lane — a dead tier reads as
  // a bug on the board, so an empty one falls back to the template's rung.
  const tierRewards = Array.from({ length: config.tierCount }, (_, index) => {
    const tier = index + 1;
    const entry = authored.find((candidate) => candidate.tier === tier);
    if (
      entry &&
      (entry.freeRewards.length > 0 || entry.premiumRewards.length > 0)
    ) {
      return entry;
    }
    return fallback[index];
  });

  return {
    payload: {
      name,
      startsAt,
      endsAt,
      ...config,
      tierRewards,
      isActive: body?.isActive !== false,
    },
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const seasons = await QuestSeasonModel.find({})
      .sort({ startsAt: -1 })
      .lean();
    return json({ seasons: seasons.map(seasonToAdminView) });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const sanitized = sanitizeBody(body);
    if ('error' in sanitized) return json({ error: sanitized.error }, 400);

    await connectMongo();
    const season = await createQuestSeason(sanitized.payload);
    return json({ ok: true, season: seasonToAdminView(season) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create season' },
      400,
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const seasonId =
      typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : '';
    if (!seasonId) return json({ error: 'Missing season id' }, 400);

    const sanitized = sanitizeBody(body);
    if ('error' in sanitized) return json({ error: sanitized.error }, 400);

    await connectMongo();
    const season = await QuestSeasonModel.findOneAndUpdate(
      { seasonId },
      { $set: sanitized.payload, $unset: { dayRewards: '', dailyTargetFlies: '' } },
      { new: true },
    );
    if (!season) return json({ error: 'Season not found' }, 404);
    return json({ ok: true, season: seasonToAdminView(season) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to update season' },
      400,
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    const seasonId =
      typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : '';
    if (!seasonId) return json({ error: 'Missing season id' }, 400);
    await connectMongo();
    await QuestSeasonModel.deleteOne({ seasonId });
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
