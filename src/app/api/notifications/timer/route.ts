export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { sendTimerPushToUser } from '@/lib/notifications/timer';
import type { PomodoroPhase } from '@/lib/frogodoroStore';

/**
 * POST /api/notifications/timer
 * Body: { phase: 'focus' | 'shortBreak' | 'longBreak', autoStartBreak?: boolean }
 *
 * Sends a push notification to all registered phone devices when a Frogodoro
 * phase finishes, including auto-started breaks and completed breaks.
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { phase, autoStartBreak = false } = await req.json();

  if (
    phase !== 'focus' &&
    phase !== 'shortBreak' &&
    phase !== 'longBreak'
  ) {
    return NextResponse.json({ error: 'Invalid timer phase' }, { status: 400 });
  }

  await connectMongo();

  const user = await UserModel.findById(uid)
    .select('notificationPrefs')
    .lean()
    .exec();

  const prefs = (user as any)?.notificationPrefs;
  const tokens: string[] = prefs?.enabled ? prefs?.fcmTokens ?? [] : [];
  const result = await sendTimerPushToUser({
    userId: uid,
    phase: phase as PomodoroPhase,
    autoStartBreak: Boolean(autoStartBreak),
    tokens,
  });

  return NextResponse.json({ ok: true, ...result });
}
