// src/app/api/notifications/register/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

/**
 * POST /api/notifications/register
 * Body: { fcmToken: string, timezone: string }
 *
 * Stores the FCM token on the user document and enables notifications.
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { fcmToken, timezone, platform } = body;

  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json(
      { error: 'fcmToken is required' },
      { status: 400 },
    );
  }

  await connectMongo();

  const baseSet = {
    'notificationPrefs.enabled': true,
    'notificationPrefs.timezone': timezone || 'UTC',
  };
  const baseSetOnInsert = {
    'notificationPrefs.activityHours': [],
    'notificationPrefs.morningSlot': 9,
    'notificationPrefs.eveningSlot': 18,
  };

  // Add token (deduplicated) and set enabled + timezone. Android tokens are
  // tracked separately so timer-control/alarm pushes (handled natively only on
  // Android) aren't sent to iOS tokens, which use the Live Activity instead.
  if (platform === 'android') {
    await UserModel.updateOne(
      { _id: uid },
      {
        $addToSet: {
          'notificationPrefs.fcmTokens': fcmToken,
          'notificationPrefs.androidFcmTokens': fcmToken,
        },
        $set: baseSet,
        $setOnInsert: baseSetOnInsert,
      },
    );
  } else {
    await UserModel.updateOne(
      { _id: uid },
      {
        $addToSet: { 'notificationPrefs.fcmTokens': fcmToken },
        $pull: { 'notificationPrefs.androidFcmTokens': fcmToken },
        $set: baseSet,
        $setOnInsert: baseSetOnInsert,
      },
    );
  }

  return NextResponse.json({ ok: true });
}
