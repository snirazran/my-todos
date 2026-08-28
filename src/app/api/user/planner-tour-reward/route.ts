export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  PLANNER_TOUR_GIFT_ID,
  TOUR_ALWAYS_SHOW_FOR_TESTING,
} from '@/lib/tour/plannerTour';

export async function POST() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    // The guard lives in the query, so a replayed tour, a double tap or two
    // devices finishing at once can only ever pay out once.
    const result = await UserModel.updateOne(
      {
        _id: userId,
        ...(TOUR_ALWAYS_SHOW_FOR_TESTING
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
