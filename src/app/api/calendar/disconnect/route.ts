export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  deleteCalendar,
  getAccessToken,
  revokeToken,
} from '@/lib/googleCalendar';

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const body = await req.json().catch(() => ({}));
  const timezone = body.timezone || 'UTC';
  const today = getZonedToday(timezone);

  const user = await UserModel.findById(uid)
    .select('googleCalendar calendarAccessToken')
    .lean();

  let calendarCleaned = false;
  try {
    const token = await getAccessToken(
      uid,
      user?.googleCalendar,
      user?.calendarAccessToken,
    );
    if (token) {
      if (user?.googleCalendar?.calendarId) {
        await deleteCalendar(token, user.googleCalendar.calendarId);
        calendarCleaned = true;
      }
      if (user?.googleCalendar?.refreshToken) {
        await revokeToken(user.googleCalendar.refreshToken);
      } else {
        await revokeToken(token);
      }
    }
  } catch (err) {
    console.error('Calendar-side cleanup failed (continuing):', err);
  }

  const removedImported = await TaskModel.deleteMany({
    userId: uid,
    calendarEventId: { $exists: true, $ne: null },
    completed: { $ne: true },
    $or: [{ date: { $gte: today } }, { date: { $exists: false } }],
  });

  await TaskModel.updateMany(
    { userId: uid, exportedEventId: { $exists: true } },
    { $unset: { exportedEventId: 1, exportFingerprint: 1 } },
  );

  await UserModel.updateOne(
    { _id: uid },
    {
      $set: { calendarSyncEnabled: false },
      $unset: { googleCalendar: 1, calendarAccessToken: 1 },
    },
  );

  return NextResponse.json({
    ok: true,
    calendarCleaned,
    removedImportedTasks: removedImported.deletedCount ?? 0,
  });
}
