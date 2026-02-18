// src/app/api/admin/test-notification/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import type { NotificationPrefs } from '@/lib/types/UserDoc';

// Same templates as the cron endpoint
const NOTIFICATION_TEMPLATES = [
  {
    id: 'hop',
    label: 'Hop to it!',
    template: (count: number) =>
      `🐸 You have ${count} task${count === 1 ? '' : 's'} left today! Hop to it!`,
  },
  {
    id: 'believes',
    label: 'Frog believes',
    template: (count: number) =>
      `🐸 ${count} task${count === 1 ? '' : 's'} waiting for you! Your frog believes in you!`,
  },
  {
    id: 'lilypad',
    label: 'Lily pad',
    template: (count: number) =>
      `🐸 Ribbit! ${count} task${count === 1 ? ' is' : 's are'} still on your lily pad!`,
  },
  {
    id: 'forget',
    label: "Don't forget",
    template: (count: number) =>
      `🐸 Don't forget! ${count} task${count === 1 ? '' : 's'} to go today!`,
  },
  {
    id: 'watching',
    label: 'Frog watching',
    template: (count: number) =>
      `🐸 Your frog is watching... ${count} task${count === 1 ? '' : 's'} left!`,
  },
];

function getTodayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * GET /api/admin/test-notification
 * Returns available templates and the user's task count
 */
export async function GET() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();

  const user = await UserModel.findById(uid, { notificationPrefs: 1 }).lean();
  const prefs = (user as any)?.notificationPrefs as
    | NotificationPrefs
    | undefined;
  const tz = prefs?.timezone || 'UTC';
  const todayYMD = getTodayInTz(tz);
  const dow = new Date(`${todayYMD}T12:00:00Z`).getUTCDay();

  const tasks = await TaskModel.find({
    userId: uid,
    deletedAt: { $exists: false },
    $or: [
      { type: 'weekly', dayOfWeek: dow as any },
      { type: 'regular', date: todayYMD },
    ],
  })
    .lean()
    .exec();

  const uncompleted = tasks.filter((t: any) => {
    if ((t.suppressedDates ?? []).includes(todayYMD)) return false;
    if (t.type === 'weekly') {
      return !(t.completedDates ?? []).includes(todayYMD);
    }
    return !t.completed;
  });

  const templates = NOTIFICATION_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    preview: t.template(uncompleted.length),
  }));

  return NextResponse.json({
    taskCount: uncompleted.length,
    hasTokens: !!prefs?.fcmTokens?.length,
    tokenCount: prefs?.fcmTokens?.length ?? 0,
    templates,
  });
}

/**
 * POST /api/admin/test-notification
 * Body: { templateId: string }
 * Sends a test notification to the current user's registered devices
 */
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { templateId } = body;

  await connectMongo();

  const user = await UserModel.findById(uid, { notificationPrefs: 1 }).lean();
  const prefs = (user as any)?.notificationPrefs as
    | NotificationPrefs
    | undefined;

  if (!prefs?.fcmTokens?.length) {
    return NextResponse.json(
      {
        error:
          'No FCM tokens registered. Open the app on a mobile device first.',
      },
      { status: 400 },
    );
  }

  const tz = prefs.timezone || 'UTC';
  const todayYMD = getTodayInTz(tz);
  const dow = new Date(`${todayYMD}T12:00:00Z`).getUTCDay();

  const tasks = await TaskModel.find({
    userId: uid,
    deletedAt: { $exists: false },
    $or: [
      { type: 'weekly', dayOfWeek: dow as any },
      { type: 'regular', date: todayYMD },
    ],
  })
    .lean()
    .exec();

  const uncompleted = tasks.filter((t: any) => {
    if ((t.suppressedDates ?? []).includes(todayYMD)) return false;
    if (t.type === 'weekly')
      return !(t.completedDates ?? []).includes(todayYMD);
    return !t.completed;
  });

  const template = NOTIFICATION_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
  }

  const messageBody = template.template(uncompleted.length);
  const messaging = getAdminMessaging();
  let sentCount = 0;
  const errors: string[] = [];

  for (const token of prefs.fcmTokens) {
    try {
      await messaging.send({
        token,
        notification: {
          title: 'FrogTask 🐸',
          body: messageBody,
        },
        data: { type: 'test_notification' },
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'task_reminders',
            icon: 'ic_notification',
            color: '#4CAF50',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: 'FrogTask 🐸', body: messageBody },
              badge: uncompleted.length,
              sound: 'default',
            },
          },
        },
      });
      sentCount++;
    } catch (err: any) {
      errors.push(err?.message || 'Unknown error');
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    totalTokens: prefs.fcmTokens.length,
    message: messageBody,
    errors: errors.length ? errors : undefined,
  });
}
