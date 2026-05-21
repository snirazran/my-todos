import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import {
  buildDefaultSeasonRewards,
  createQuestSeason,
  sanitizeSeasonRewards,
  seasonToAdminView,
} from '@/lib/quests/seasons';
import type {
  QuestAmountMode,
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';

const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
]);
const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

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
    amount: input.type === 'BOX' ? Math.max(1, Math.floor(Number(input.amount) || 1)) : undefined,
  };
}

function sanitizeDayRewards(input: unknown) {
  const normalized = sanitizeSeasonRewards(input).map((entry) => ({
    day: entry.day,
    freeRewards: entry.freeRewards
      .map(sanitizeReward)
      .filter(Boolean)
      .slice(0, 1) as QuestReward[],
    premiumRewards: entry.premiumRewards
      .map(sanitizeReward)
      .filter(Boolean)
      .slice(0, 1) as QuestReward[],
  }));
  return normalized.filter(
    (entry) => entry.freeRewards.length > 0 || entry.premiumRewards.length > 0,
  );
}

function sanitizeBody(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const startsAt = new Date(body?.startsAt);
  const endsAt = new Date(body?.endsAt);
  const coverImageUrl =
    typeof body?.coverImageUrl === 'string' &&
    body.coverImageUrl.startsWith('data:image/')
      ? body.coverImageUrl
      : undefined;
  const dailyTargetFlies = Math.max(1, Math.floor(Number(body?.dailyTargetFlies) || 3));
  const dayCount = Math.max(1, Math.min(90, Math.floor(Number(body?.dayCount) || 1)));
  const rawDayRewards = sanitizeDayRewards(body?.dayRewards);
  const fallbackDayRewards = buildDefaultSeasonRewards(dayCount);
  const dayRewards = Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return (
      rawDayRewards.find((entry) => entry.day === day) ??
      fallbackDayRewards[index]
    );
  });

  if (!name) return { error: 'Season name is required' };
  if (!Number.isFinite(startsAt.getTime())) return { error: 'Start date is required' };
  if (!Number.isFinite(endsAt.getTime())) return { error: 'End date is required' };
  if (endsAt <= startsAt) return { error: 'End date must be after start date' };

  return {
    payload: {
      name,
      coverImageUrl,
      startsAt,
      endsAt,
      dailyTargetFlies,
      dayRewards,
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
    const updateSet = { ...sanitized.payload };
    const unsetFields: Record<string, 1> = {};
    if (!updateSet.coverImageUrl) {
      delete updateSet.coverImageUrl;
      unsetFields.coverImageUrl = 1;
    }
    const season = await QuestSeasonModel.findOneAndUpdate(
      { seasonId },
      {
        $set: updateSet,
        ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
      },
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
