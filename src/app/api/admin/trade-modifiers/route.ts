export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import TradeModifiersConfigModel, {
  TRADE_MODIFIERS_CONFIG_ID,
  ensureTradeModifiersConfig,
  sanitizeFuelRarity,
} from '@/lib/models/TradeModifiersConfig';
import {
  DEFAULT_TRADE_MODIFIERS,
  DEFAULT_TRADE_RECIPES,
} from '@/lib/skins/tradeModifiers';

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  return NextResponse.json({
    config: await ensureTradeModifiersConfig(),
    defaults: DEFAULT_TRADE_MODIFIERS,
  });
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
    await ensureTradeModifiersConfig();

    const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.floor(n)));
    };

    const update: Record<string, unknown> = {
      allSparesFuelWaived: clampInt(
        body.allSparesFuelWaived,
        0,
        12,
        DEFAULT_TRADE_MODIFIERS.allSparesFuelWaived,
      ),
      allSparesNewFirstWeight: clampInt(
        body.allSparesNewFirstWeight,
        1,
        20,
        DEFAULT_TRADE_MODIFIERS.allSparesNewFirstWeight,
      ),
      plusFuelWaived: clampInt(
        body.plusFuelWaived,
        0,
        12,
        DEFAULT_TRADE_MODIFIERS.plusFuelWaived,
      ),
      maxFuelWaived: clampInt(
        body.maxFuelWaived,
        0,
        12,
        DEFAULT_TRADE_MODIFIERS.maxFuelWaived,
      ),
      aimPlusDiscountPercent: clampInt(
        body.aimPlusDiscountPercent,
        0,
        100,
        DEFAULT_TRADE_MODIFIERS.aimPlusDiscountPercent,
      ),
      goldenTradeChancePercent: clampInt(
        body.goldenTradeChancePercent,
        0,
        100,
        DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
      ),
      goldenTradeRewardCount: clampInt(
        body.goldenTradeRewardCount,
        1,
        5,
        DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
      ),
      newFirstWeight: clampInt(
        body.newFirstWeight,
        1,
        20,
        DEFAULT_TRADE_MODIFIERS.newFirstWeight,
      ),
      wishlistRedirectPercent: clampInt(
        body.wishlistRedirectPercent,
        0,
        100,
        DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
      ),
      wishlistSlotsFree: clampInt(
        body.wishlistSlotsFree,
        1,
        50,
        DEFAULT_TRADE_MODIFIERS.wishlistSlotsFree,
      ),
      wishlistSlotsPlus: clampInt(
        body.wishlistSlotsPlus,
        1,
        50,
        DEFAULT_TRADE_MODIFIERS.wishlistSlotsPlus,
      ),
    };

    if (Array.isArray(body.recipes)) {
      update.recipes = DEFAULT_TRADE_RECIPES.map((fallback) => {
        const sent = body.recipes.find((entry: any) => entry?.from === fallback.from);
        const fuelRarity = sanitizeFuelRarity(
          sent?.fuelRarity,
          fallback.from,
          fallback.fuelRarity,
        );
        return {
          from: fallback.from,
          to: fallback.to,
          itemCount: clampInt(sent?.itemCount, 2, 12, fallback.itemCount),
          fuelRarity,
          fuelCount: fuelRarity
            ? clampInt(sent?.fuelCount, 0, 12, fallback.fuelCount)
            : 0,
          aimPriceFlies: clampInt(
            sent?.aimPriceFlies,
            0,
            100000,
            fallback.aimPriceFlies,
          ),
        };
      });
    }

    await TradeModifiersConfigModel.updateOne(
      { configId: TRADE_MODIFIERS_CONFIG_ID },
      { $set: update },
      { upsert: true },
    );

    return NextResponse.json({
      ok: true,
      config: await ensureTradeModifiersConfig(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 400 },
    );
  }
}
