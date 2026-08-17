import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import FlyEconomyConfigModel, {
  FLY_ECONOMY_CONFIG_ID,
} from '@/lib/models/FlyEconomyConfig';
import FlyLedgerModel from '@/lib/models/FlyLedger';
import {
  FLY_ECONOMY_DEFAULTS,
  FLY_ECONOMY_LIMITS,
  loadFlyEconomyConfig,
  invalidateFlyEconomyConfig,
  mergeFlyEconomyConfig,
} from '@/lib/economy/config';
import { getZonedToday } from '@/lib/utils';
import { daysAgoKey } from '@/lib/economy/guards';

export const dynamic = 'force-dynamic';

/** What each faucet has actually paid lately — the tuning half of the screen. */
async function ledgerSummary(days: number) {
  const today = getZonedToday('UTC');
  const from = daysAgoKey(today, Math.max(1, days) - 1);
  const rows = await FlyLedgerModel.aggregate<{
    _id: string;
    granted: number;
    spent: number;
    users: string[];
  }>([
    { $match: { dayKey: { $gte: from, $lte: today } } },
    {
      $group: {
        _id: '$source',
        granted: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        spent: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } },
        users: { $addToSet: '$userId' },
      },
    },
  ]);

  return {
    from,
    to: today,
    sources: rows
      .map((row) => ({
        source: row._id,
        granted: row.granted,
        spent: Math.abs(row.spent),
        users: row.users.length,
      }))
      .sort((a, b) => b.granted - a.granted),
  };
}

async function respond(days = 7) {
  const [config, ledger] = await Promise.all([
    loadFlyEconomyConfig(),
    ledgerSummary(days).catch(() => null),
  ]);
  return NextResponse.json({
    economy: config,
    defaults: FLY_ECONOMY_DEFAULTS,
    limits: FLY_ECONOMY_LIMITS,
    ledger,
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const days = Number(req.nextUrl.searchParams.get('days')) || 7;
    return await respond(Math.min(90, Math.max(1, days)));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load economy config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminId = await requireUserId();
    const body = await req.json();
    await connectMongo();

    // Merge before storing: an out-of-range or missing knob falls back to the
    // default instead of being written through as-is.
    const settings = mergeFlyEconomyConfig(body?.economy ?? body);

    await FlyEconomyConfigModel.findOneAndUpdate(
      { configId: FLY_ECONOMY_CONFIG_ID },
      { $set: { settings, updatedBy: adminId } },
      { new: true, upsert: true },
    ).lean();

    invalidateFlyEconomyConfig();
    return await respond();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save economy config',
      },
      { status: 400 },
    );
  }
}
