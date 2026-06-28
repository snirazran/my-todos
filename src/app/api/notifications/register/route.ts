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

  // An FCM token identifies one device, which belongs to one account at a time.
  // Logging into a different account on the same device leaves the token on the
  // old user doc, so a token-authed lookup (e.g. the Live Activity /control
  // intent) can resolve to the wrong, timer-less account. Strip the token off
  // every other user before re-adding it to this one so it stays unique.
  await UserModel.updateMany(
    {
      _id: { $ne: uid },
      $or: [
        { 'notificationPrefs.fcmTokens': fcmToken },
        { 'notificationPrefs.androidFcmTokens': fcmToken },
      ],
    },
    {
      $pull: {
        'notificationPrefs.fcmTokens': fcmToken,
        'notificationPrefs.androidFcmTokens': fcmToken,
        'notificationPrefs.iosFcmTokens': fcmToken,
        'notificationPrefs.webFcmTokens': fcmToken,
      },
    },
  );

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
        $pull: {
          'notificationPrefs.iosFcmTokens': fcmToken,
          'notificationPrefs.webFcmTokens': fcmToken,
        },
        $set: baseSet,
        $setOnInsert: baseSetOnInsert,
      },
    );
  } else if (platform === 'ios') {
    await UserModel.updateOne(
      { _id: uid },
      {
        $addToSet: {
          'notificationPrefs.fcmTokens': fcmToken,
          'notificationPrefs.iosFcmTokens': fcmToken,
        },
        $pull: {
          'notificationPrefs.androidFcmTokens': fcmToken,
          'notificationPrefs.webFcmTokens': fcmToken,
        },
        $set: baseSet,
        $setOnInsert: baseSetOnInsert,
      },
    );
  } else {
    await UserModel.updateOne(
      { _id: uid },
      {
        $addToSet: {
          'notificationPrefs.fcmTokens': fcmToken,
          'notificationPrefs.webFcmTokens': fcmToken,
        },
        $pull: {
          'notificationPrefs.androidFcmTokens': fcmToken,
          'notificationPrefs.iosFcmTokens': fcmToken,
        },
        $set: baseSet,
        $setOnInsert: baseSetOnInsert,
      },
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/notifications/register
 * Body: { fcmToken: string }
 *
 * Removes a single device's token (used by the web "turn off" toggle, which
 * can't deep-link to OS settings). The browser permission stays granted; the
 * device simply stops receiving until re-registered.
 */
export async function DELETE(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { fcmToken } = body;

  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ error: 'fcmToken is required' }, { status: 400 });
  }

  await connectMongo();

  await UserModel.updateOne(
    { _id: uid },
    {
      $pull: {
        'notificationPrefs.fcmTokens': fcmToken,
        'notificationPrefs.androidFcmTokens': fcmToken,
        'notificationPrefs.iosFcmTokens': fcmToken,
        'notificationPrefs.webFcmTokens': fcmToken,
      },
    },
  );

  return NextResponse.json({ ok: true });
}
