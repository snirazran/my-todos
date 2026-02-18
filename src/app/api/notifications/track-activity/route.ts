// src/app/api/notifications/track-activity/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

const MAX_ACTIVITY_ENTRIES = 50;

/**
 * Compute the best notification hour within a given window from an activity histogram.
 * Falls back to `fallback` if no data exists in the window.
 */
function bestHourInRange(
  histogram: Map<number, number>,
  rangeStart: number,
  rangeEnd: number,
  fallback: number,
): number {
  let bestHour = fallback;
  let bestCount = 0;

  for (let h = rangeStart; h <= rangeEnd; h++) {
    const count = histogram.get(h) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestHour = h;
    }
  }

  return bestHour;
}

/**
 * Recompute morning and evening notification slots from activity data.
 * Morning window: 8-13, Evening window: 16-21.
 * We send 30 min before the peak, so the slot is the hour itself
 * and the cron will fire at :30 of the previous hour.
 */
function computeSlots(activityHours: number[]): {
  morningSlot: number;
  eveningSlot: number;
} {
  const histogram = new Map<number, number>();
  for (const h of activityHours) {
    histogram.set(h, (histogram.get(h) ?? 0) + 1);
  }

  return {
    morningSlot: bestHourInRange(histogram, 8, 13, 9),
    eveningSlot: bestHourInRange(histogram, 16, 21, 18),
  };
}

/**
 * POST /api/notifications/track-activity
 * Body: { timezone: string }
 *
 * Records the current hour in the user's timezone to build
 * the activity histogram used by the smart timing algorithm.
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const tz = body.timezone || 'UTC';

  await connectMongo();

  // Get current hour in user's timezone
  const now = new Date();
  let currentHour: number;
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(now);
    currentHour = parseInt(formatted, 10);
  } catch {
    currentHour = now.getUTCHours();
  }

  // Fetch current activity data
  const user = await UserModel.findById(uid, {
    'notificationPrefs.activityHours': 1,
  }).lean();

  const currentHours: number[] =
    (user as any)?.notificationPrefs?.activityHours ?? [];

  // Keep only the last MAX_ACTIVITY_ENTRIES - 1 entries + new one
  const updatedHours = [
    ...currentHours.slice(-(MAX_ACTIVITY_ENTRIES - 1)),
    currentHour,
  ];

  // Recompute optimal notification slots
  const { morningSlot, eveningSlot } = computeSlots(updatedHours);

  await UserModel.updateOne(
    { _id: uid },
    {
      $set: {
        'notificationPrefs.activityHours': updatedHours,
        'notificationPrefs.morningSlot': morningSlot,
        'notificationPrefs.eveningSlot': eveningSlot,
        'notificationPrefs.timezone': tz,
      },
    },
  );

  return NextResponse.json({ ok: true, morningSlot, eveningSlot });
}
