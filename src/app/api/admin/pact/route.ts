export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import PactConfigModel, {
  PACT_CONFIG_ID,
  PACT_PAYOUT_NUMBERS,
} from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { ensurePactConfig } from '@/lib/pact/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import {
  type PactBonusRewards,
  type PactRarity,
  type PactSuggestion,
} from '@/lib/pact/types';
import { v4 as uuid } from 'uuid';

const RARITIES: PactRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/**
 * Milestone and prestige lanes carry two entries the quest reward vocabulary
 * has no room for — a Lily Pad and a guaranteed-rarity draw — so they are
 * whitelisted here rather than passed through, which is what let an unknown
 * `type` reach settlement and silently pay nothing.
 */
function sanitizeBonusRewards(raw: unknown): PactBonusRewards {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      const type = String(entry?.type ?? '');
      if (type === 'SHIELD') {
        return {
          type: 'SHIELD' as const,
          amount: Math.min(5, Math.max(1, Math.floor(Number(entry?.amount) || 1))),
        };
      }
      if (type === 'RARITY_ITEM') {
        const rarity = RARITIES.includes(entry?.rarity) ? entry.rarity : 'epic';
        return {
          type: 'RARITY_ITEM' as const,
          rarity,
          amount: Math.min(5, Math.max(1, Math.floor(Number(entry?.amount) || 1))),
        };
      }
      if (type === 'FLIES') {
        return {
          type: 'FLIES' as const,
          amount: Math.min(100000, Math.max(0, Math.floor(Number(entry?.amount) || 0))),
        };
      }
      if ((type === 'BOX' || type === 'ITEM') && entry?.itemId) {
        return {
          type,
          itemId: String(entry.itemId),
          amount: Math.min(10, Math.max(1, Math.floor(Number(entry?.amount) || 1))),
        };
      }
      if (type === 'BACKGROUND' && entry?.backgroundId) {
        return { type, backgroundId: String(entry.backgroundId) };
      }
      return null;
    })
    .filter(Boolean) as PactBonusRewards;
}

function sanitizeSuggestions(raw: unknown): PactSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any): PactSuggestion | null => {
      const text = String(entry?.text ?? '').trim().slice(0, 80);
      const categoryId = String(entry?.categoryId ?? '').trim();
      if (!text || !categoryId) return null;
      return {
        id: String(entry?.id ?? '').trim() || uuid(),
        categoryId,
        text,
        isActive: entry?.isActive !== false,
        generated: !!entry?.generated,
        picked: Math.max(0, Number(entry?.picked) || 0),
        kept: Math.max(0, Number(entry?.kept) || 0),
      };
    })
    .filter((entry): entry is PactSuggestion => !!entry);
}

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  const [config, categories, catalog] = await Promise.all([
    ensurePactConfig(),
    QuestCategoryModel.find({}, { categoryId: 1, name: 1, shortLabel: 1, accent: 1 })
      .sort({ createdAt: 1 })
      .lean(),
    getFullCatalog(),
  ]);
  return NextResponse.json({ config, categories, catalog });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    await connectMongo();
    await ensurePactConfig();

    const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.floor(n)));
    };

    const clampFloat = (
      value: unknown,
      min: number,
      max: number,
      fallback: number,
      step = 0.01,
    ) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      const clamped = Math.min(max, Math.max(min, n));
      return Math.round(clamped / step) * step;
    };

    const update: Record<string, unknown> = {
      isActive: body.isActive !== false,
      pickHour: clampInt(body.pickHour, 0, 23, 18),
      partialCreditExponent: clampFloat(
        body.partialCreditExponent,
        1,
        4,
        PACT_PAYOUT_NUMBERS.partialCreditExponent,
        0.1,
      ),
      weekValuePerSession: clampInt(
        body.weekValuePerSession,
        0,
        500,
        PACT_PAYOUT_NUMBERS.weekValuePerSession,
      ),
      weekValueBaseSessions: clampFloat(
        body.weekValueBaseSessions,
        0,
        10,
        PACT_PAYOUT_NUMBERS.weekValueBaseSessions,
        0.25,
      ),
      comebackBonusFlies: clampInt(
        body.comebackBonusFlies,
        0,
        2000,
        PACT_PAYOUT_NUMBERS.comebackBonusFlies,
      ),
      prestigeWeeks: clampInt(
        body.prestigeWeeks,
        0,
        104,
        PACT_PAYOUT_NUMBERS.prestigeWeeks,
      ),
      prestigeBaseStep: clampFloat(
        body.prestigeBaseStep,
        0,
        1,
        PACT_PAYOUT_NUMBERS.prestigeBaseStep,
        0.01,
      ),
      maxEffectiveMultiplier: clampFloat(
        body.maxEffectiveMultiplier,
        1,
        10,
        PACT_PAYOUT_NUMBERS.maxEffectiveMultiplier,
        0.05,
      ),
      nearMissPercent: clampInt(
        body.nearMissPercent,
        0,
        100,
        PACT_PAYOUT_NUMBERS.nearMissPercent,
      ),
      plusSwapTokensPerMonth: clampInt(body.plusSwapTokensPerMonth, 0, 20, 4),
      minOptionsPerArea: clampInt(body.minOptionsPerArea, 1, 6, 3),
      autoGenerate: body.autoGenerate !== false,
    };

    if (Array.isArray(body.completionRewards)) {
      update.completionRewards = body.completionRewards;
    }
    if (Array.isArray(body.completionGiftTiers)) {
      update.completionGiftTiers = body.completionGiftTiers
        .map((tier: any) => ({
          minSessions: clampInt(tier?.minSessions, 1, 7, 2),
          rewards: Array.isArray(tier?.rewards) ? tier.rewards : [],
        }))
        .sort((a: any, b: any) => a.minSessions - b.minSessions);
    }
    if (Array.isArray(body.streakMultipliers)) {
      update.streakMultipliers = body.streakMultipliers
        .map((rung: any) => ({
          weeks: clampInt(rung?.weeks, 1, 104, 2),
          // Fractional now: the ladder climbs in 0.25 steps rather than whole
          // numbers, which is what leaves room for prestige underneath it.
          multiplier: clampFloat(rung?.multiplier, 1, 10, 1, 0.05),
          rewards: sanitizeBonusRewards(rung?.rewards),
        }))
        .sort((a: any, b: any) => a.weeks - b.weeks);
    }
    if (Array.isArray(body.prestigeRewards)) {
      update.prestigeRewards = sanitizeBonusRewards(body.prestigeRewards);
    }
    if (Array.isArray(body.postSetPrestigeRewards)) {
      update.postSetPrestigeRewards = sanitizeBonusRewards(
        body.postSetPrestigeRewards,
      );
    }
    if (Array.isArray(body.prestigeCycles)) {
      update.prestigeCycles = body.prestigeCycles.map((cycle: any) => ({
        label: String(cycle?.label ?? '').trim().slice(0, 40),
        rewards: sanitizeBonusRewards(cycle?.rewards),
      }));
    }
    if (Array.isArray(body.suggestions)) {
      update.suggestions = sanitizeSuggestions(body.suggestions);
    }

    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID },
      { $set: update },
      { upsert: true },
    );

    const config = await PactConfigModel.findOne({
      configId: PACT_CONFIG_ID,
    }).lean();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 400 },
    );
  }
}
