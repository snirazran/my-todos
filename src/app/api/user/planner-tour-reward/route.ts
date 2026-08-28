export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { PLANNER_TOUR_GIFT_ID } from '@/lib/tour/plannerTour';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    // Local-only: lets a replayed tour pay out again so the whole ending —
    // claim, box, reveal — stays testable. Never reachable in production.
    let replay = false;
    if (process.env.NODE_ENV !== 'production') {
      const body = await req.json().catch(() => null);
      replay = (body as { replay?: boolean } | null)?.replay === true;
    }

    // The guard lives in the query, so a replayed tour, a double tap or two
    // devices finishing at once can only ever pay out once.
    const result = await UserModel.updateOne(
      {
        _id: userId,
        ...(replay
          ? {}
          : { 'seenIntros.plannerTourRewarded': { $ne: true } }),
      },
      {
        $set: {
          'seenIntros.plannerTour': true,
          'seenIntros.plannerTourRewarded': true,
        },
        $inc: { [`wardrobe.inventory.${PLANNER_TOUR_GIFT_ID}`]: 1 },
        $addToSet: { 'wardrobe.unseenItems': PLANNER_TOUR_GIFT_ID },
      },
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ ok: true, granted: false });
    }

    await recordAnalyticsEvent({
      userId,
      name: 'planner_tour_completed',
      properties: { gift_box_id: PLANNER_TOUR_GIFT_ID },
    });

    return NextResponse.json({
      ok: true,
      granted: true,
      giftBoxId: PLANNER_TOUR_GIFT_ID,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
