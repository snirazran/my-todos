export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import PactConfigModel, {
  PACT_CONFIG_ID,
  PACT_V2_PAYOUT,
} from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { ensurePactConfig } from '@/lib/pact/engine';
import { type PactSuggestion } from '@/lib/pact/types';
import { v4 as uuid } from 'uuid';

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
  const [config, categories] = await Promise.all([
    ensurePactConfig(),
    QuestCategoryModel.find({}, { categoryId: 1, name: 1, shortLabel: 1, accent: 1 })
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  return NextResponse.json({ config, categories });
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

    const update: Record<string, unknown> = {
      isActive: body.isActive !== false,
      pickHour: clampInt(body.pickHour, 0, 23, 18),
      fliesPerCompletion: clampInt(
        body.fliesPerCompletion,
        0,
        200,
        PACT_V2_PAYOUT.fliesPerCompletion,
      ),
      weekBonusFlies: clampInt(
        body.weekBonusFlies,
        0,
        2000,
        PACT_V2_PAYOUT.weekBonusFlies,
      ),
      comebackBonusFlies: clampInt(
        body.comebackBonusFlies,
        0,
        2000,
        PACT_V2_PAYOUT.comebackBonusFlies,
      ),
      milestoneEveryWeeks: clampInt(body.milestoneEveryWeeks, 0, 52, 2),
      shieldCapFree: clampInt(body.shieldCapFree, 0, 5, 1),
      shieldCapPlus: clampInt(body.shieldCapPlus, 0, 5, 2),
      shieldEarnEveryWeeks: clampInt(body.shieldEarnEveryWeeks, 0, 12, 2),
      shieldPriceFlies: clampInt(body.shieldPriceFlies, 1, 2000, 100),
      shieldAdsRequired: clampInt(body.shieldAdsRequired, 1, 5, 1),
      shieldAdMinStreak: clampInt(body.shieldAdMinStreak, 0, 12, 2),
      plusSwapTokensPerMonth: clampInt(body.plusSwapTokensPerMonth, 0, 20, 4),
      minOptionsPerArea: clampInt(body.minOptionsPerArea, 1, 6, 3),
      autoGenerate: body.autoGenerate !== false,
    };

    if (Array.isArray(body.completionRewards)) {
      update.completionRewards = body.completionRewards;
    }
    if (Array.isArray(body.milestoneRewards)) {
      update.milestoneRewards = body.milestoneRewards;
    }
    if (Array.isArray(body.streakTiers)) {
      update.streakTiers = body.streakTiers
        .map((tier: any) => ({
          weeks: clampInt(tier?.weeks, 1, 520, 2),
          rewards: Array.isArray(tier?.rewards) ? tier.rewards : [],
        }))
        .sort((a: any, b: any) => a.weeks - b.weeks);
    }
    if (Array.isArray(body.masteryTiers)) {
      update.masteryTiers = body.masteryTiers
        .map((tier: any) => ({
          weeks: clampInt(tier?.weeks, 1, 520, 3),
          rewards: Array.isArray(tier?.rewards) ? tier.rewards : [],
          plusRewards: Array.isArray(tier?.plusRewards) ? tier.plusRewards : undefined,
        }))
        .sort((a: any, b: any) => a.weeks - b.weeks);
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
