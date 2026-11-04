export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import TradeModifiersConfigModel, {
  TRADE_MODIFIERS_CONFIG_ID,
  clampTradeInt,
  ensureTradeModifiersConfig,
  sanitizeRecipes,
} from '@/lib/models/TradeModifiersConfig';
import {
  DEFAULT_TRADE_MODIFIERS,
  TRADE_LADDER_VERSION,
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

    const update: Record<string, unknown> = {
      ladderVersion: TRADE_LADDER_VERSION,
      goldenTradeChancePercent: clampTradeInt(
        body.goldenTradeChancePercent,
        0,
        100,
        DEFAULT_TRADE_MODIFIERS.goldenTradeChancePercent,
      ),
      goldenTradeRewardCount: clampTradeInt(
        body.goldenTradeRewardCount,
        1,
        5,
        DEFAULT_TRADE_MODIFIERS.goldenTradeRewardCount,
      ),
      wishlistRedirectPercent: clampTradeInt(
        body.wishlistRedirectPercent,
        0,
        100,
        DEFAULT_TRADE_MODIFIERS.wishlistRedirectPercent,
      ),
      wishlistSlotsFree: clampTradeInt(
        body.wishlistSlotsFree,
        1,
        50,
        DEFAULT_TRADE_MODIFIERS.wishlistSlotsFree,
      ),
      wishlistSlotsPlus: clampTradeInt(
        body.wishlistSlotsPlus,
        1,
        50,
        DEFAULT_TRADE_MODIFIERS.wishlistSlotsPlus,
      ),
    };

    if (Array.isArray(body.recipes)) {
      update.recipes = sanitizeRecipes(body.recipes);
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
