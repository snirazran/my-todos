export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import PactConfigModel, { PACT_CONFIG_ID } from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { ensurePactConfig } from '@/lib/pact/engine';
import type { PactSuggestion } from '@/lib/pact/types';
import { v4 as uuid } from 'uuid';

function sanitizeSuggestions(raw: unknown): PactSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any): PactSuggestion | null => {
      const text = String(entry?.text ?? '').trim().slice(0, 80);
      const categoryId = String(entry?.categoryId ?? '').trim();
      if (!text || !categoryId) return null;
      const days = Array.from(
        new Set<number>(
          (Array.isArray(entry?.days) ? entry.days : []).map(Number),
        ),
      )
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);
      const tier =
        entry?.tier === 'starter' || entry?.tier === 'strong' ? entry.tier : 'steady';
      return {
        id: String(entry?.id ?? '').trim() || uuid(),
        categoryId,
        text,
        days: days.length ? days : [1, 3, 5],
        startTime: /^\d{2}:\d{2}$/.test(String(entry?.startTime))
          ? String(entry.startTime)
          : '19:00',
        minutes: Number.isFinite(Number(entry?.minutes))
          ? Math.max(0, Math.floor(Number(entry.minutes)))
          : undefined,
        tier,
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
      fliesPerCompletion: clampInt(body.fliesPerCompletion, 0, 200, 5),
      weekBonusFlies: clampInt(body.weekBonusFlies, 0, 2000, 38),
      bigCommitmentBonusFlies: clampInt(body.bigCommitmentBonusFlies, 0, 2000, 8),
      milestoneEveryWeeks: clampInt(body.milestoneEveryWeeks, 0, 52, 2),
      shieldsFreePerMonth: clampInt(body.shieldsFreePerMonth, 0, 10, 1),
      shieldsPlusPerMonth: clampInt(body.shieldsPlusPerMonth, 0, 20, 4),
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
