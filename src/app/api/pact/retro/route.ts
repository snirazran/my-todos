export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getPactView, normalizePactStreak } from '@/lib/pact/engine';
import { isPremiumUser } from '@/lib/quests/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

/**
 * The retroactive unlock: every fly Plus would have added to a past pact claim
 * is banked while the user is free, and paid out in full the first time they
 * claim it as a subscriber. Nothing is granted to a free account, so the pile
 * is a reason to upgrade rather than a way to farm one.
 */
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

    const user = await UserModel.findById(userId);
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!isPremiumUser(user.toObject())) {
      return NextResponse.json(
        { error: 'This unlocks with Plus' },
        { status: 403 },
      );
    }

    const streak = normalizePactStreak(user.toObject());
    const owed = Math.max(0, streak.forgoneFlies);
    if (owed === 0) {
      return NextResponse.json({ error: 'Nothing waiting' }, { status: 400 });
    }

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.flies = (user.wardrobe.flies ?? 0) + owed;
    user.markModified('wardrobe');
    (user as any).set('quests.pactStreak.forgoneFlies', 0);
    await user.save();

    await recordAnalyticsEvent({
      userId,
      name: 'pact_retro_claimed',
      properties: { flies: owed },
    });

    const view = await getPactView({ userId, timezone });
    return NextResponse.json({ ok: true, fliesGranted: owed, view });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not claim' },
      { status: 400 },
    );
  }
}
