export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumUser } from '@/lib/quests/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { logFlyGrant } from '@/lib/economy/ledger';
import { readLeapState } from '@/lib/leap/state';
import { getLeapView } from '@/lib/leap/view';
import { getZonedToday } from '@/lib/utils';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    await connectMongo();

    const user = await UserModel.findById(userId)
      .select('quests premiumUntil')
      .lean<any>();
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!isPremiumUser(user)) {
      return NextResponse.json({ error: 'This unlocks with Plus' }, { status: 403 });
    }
    const owed = readLeapState(user)?.forgoneFlies ?? 0;
    if (owed <= 0) {
      return NextResponse.json({ error: 'Nothing waiting' }, { status: 400 });
    }

    const claimed = await UserModel.updateOne(
      { _id: userId, 'quests.leap.forgoneFlies': owed },
      {
        $set: { 'quests.leap.forgoneFlies': 0 },
        $inc: { 'wardrobe.flies': owed },
      },
    );
    if (claimed.modifiedCount === 0) {
      return NextResponse.json({ error: 'Nothing waiting' }, { status: 409 });
    }

    await logFlyGrant({
      userId,
      source: 'leap',
      occurrenceKey: `leap:retro:${Date.now()}`,
      amount: owed,
      dayKey: getZonedToday(timezone),
      meta: { retro: true },
    });
    await recordAnalyticsEvent({
      userId,
      name: 'leap_retro_claimed',
      properties: { flies: owed },
    });

    const { view } = await getLeapView({ userId, timezone });
    return NextResponse.json({ ok: true, fliesGranted: owed, view });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not claim' },
      { status: 400 },
    );
  }
}
