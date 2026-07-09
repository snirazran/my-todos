export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import { Types } from 'mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  APP_TASK_PROP,
  GcalError,
  buildRRule,
  deleteEvent,
  ensureAppCalendar,
  eventTimesForTask,
  exportFingerprint,
  getAccessToken,
  insertEvent,
  listEvents,
  nextOccurrenceOnOrAfter,
  patchEvent,
  type GcalEvent,
} from '@/lib/googleCalendar';

const IMPORT_WINDOW_DAYS = 7;
const EXPORT_WINDOW_DAYS = 30;

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function addDaysYMD(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function enumerateDays(fromYMD: string, count: number) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDaysYMD(fromYMD, i));
  return out;
}

// ---------------------------------------------------------------------------
// Push: app tasks -> the app-owned "Frogress" calendar
// ---------------------------------------------------------------------------

function regularTaskFingerprint(t: TaskDoc, tz: string) {
  return exportFingerprint(['regular', t.text, t.date, t.startTime, t.endTime, tz]);
}

function groupFingerprint(group: TaskDoc[], rrule: string, tz: string) {
  const doc = group[0];
  return exportFingerprint(['group', doc.text, rrule, doc.startTime, doc.endTime, tz]);
}

async function pushTasksToCalendar(
  uid: string,
  token: string,
  calendarId: string,
  today: string,
  tz: string,
) {
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let errors = 0;
  const exportEnd = addDaysYMD(today, EXPORT_WINDOW_DAYS);

  const regulars = await TaskModel.find({
    userId: uid,
    type: 'regular',
    deletedAt: { $exists: false },
    completed: { $ne: true },
    date: { $gte: today, $lte: exportEnd },
  }).lean<TaskDoc[]>();

  for (const t of regulars) {
    const fp = regularTaskFingerprint(t, tz);
    try {
      if (!t.exportedEventId) {
        const ev = await insertEvent(token, calendarId, {
          summary: t.text,
          ...eventTimesForTask(t, t.date!, tz),
          extendedProperties: { private: { [APP_TASK_PROP]: t.id } },
        });
        await TaskModel.updateOne(
          { userId: uid, id: t.id, type: 'regular' },
          { $set: { exportedEventId: ev.id, exportFingerprint: fp } },
        );
        created++;
      } else if (t.exportFingerprint !== fp) {
        await patchEvent(token, calendarId, t.exportedEventId, {
          summary: t.text,
          ...eventTimesForTask(t, t.date!, tz),
        });
        await TaskModel.updateOne(
          { userId: uid, id: t.id, type: 'regular' },
          { $set: { exportFingerprint: fp } },
        );
        updated++;
      }
    } catch (e) {
      if (e instanceof GcalError && e.status === 401) throw e;
      if (e instanceof GcalError && (e.status === 404 || e.status === 410)) {
        await TaskModel.updateOne(
          { userId: uid, id: t.id, type: 'regular' },
          { $unset: { exportedEventId: 1, exportFingerprint: 1 } },
        );
      }
      errors++;
    }
  }

  const weeklies = await TaskModel.find({
    userId: uid,
    type: 'weekly',
    deletedAt: { $exists: false },
  }).lean<TaskDoc[]>();

  const groups = new Map<string, TaskDoc[]>();
  for (const doc of weeklies) {
    const key = doc.repeatGroupId ?? `solo:${doc.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const activeGroupKeys = new Set<string>();
  for (const [key, group] of Array.from(groups.entries())) {
    const rrule = buildRRule(group);
    const anchor = rrule ? nextOccurrenceOnOrAfter(group, today) : null;
    if (!rrule || !anchor) continue;
    activeGroupKeys.add(key);

    const doc = group[0];
    const fp = groupFingerprint(group, rrule, tz);
    const exportedEventId = group.find(
      (g: TaskDoc) => g.exportedEventId,
    )?.exportedEventId;
    const groupFilter = doc.repeatGroupId
      ? { userId: uid, repeatGroupId: doc.repeatGroupId }
      : { userId: uid, id: doc.id };

    try {
      if (!exportedEventId) {
        const ev = await insertEvent(token, calendarId, {
          summary: doc.text,
          ...eventTimesForTask(doc, anchor, tz),
          recurrence: [rrule],
          extendedProperties: { private: { [APP_TASK_PROP]: `group:${key}` } },
        });
        await TaskModel.updateMany(groupFilter, {
          $set: { exportedEventId: ev.id, exportFingerprint: fp },
        });
        created++;
      } else if (group.some((g: TaskDoc) => g.exportFingerprint !== fp)) {
        await patchEvent(token, calendarId, exportedEventId, {
          summary: doc.text,
          ...eventTimesForTask(doc, anchor, tz),
          recurrence: [rrule],
        });
        await TaskModel.updateMany(groupFilter, {
          $set: { exportedEventId, exportFingerprint: fp },
        });
        updated++;
      }
    } catch (e) {
      if (e instanceof GcalError && e.status === 401) throw e;
      if (e instanceof GcalError && (e.status === 404 || e.status === 410)) {
        await TaskModel.updateMany(groupFilter, {
          $unset: { exportedEventId: 1, exportFingerprint: 1 },
        });
      }
      errors++;
    }
  }

  // Reconcile: remove events whose task is gone, completed, or past.
  const liveRegularIds = new Set(regulars.map((t) => t.id));
  let appEvents: GcalEvent[] = [];
  try {
    appEvents = await listEvents(token, calendarId, { showDeleted: 'false' });
  } catch (e) {
    if (e instanceof GcalError && e.status === 401) throw e;
    errors++;
  }
  for (const ev of appEvents) {
    const ref = ev.extendedProperties?.private?.[APP_TASK_PROP];
    if (!ref || ev.status === 'cancelled') continue;
    const stillLive = ref.startsWith('group:')
      ? activeGroupKeys.has(ref.slice('group:'.length))
      : liveRegularIds.has(ref);
    if (stillLive) continue;
    try {
      await deleteEvent(token, calendarId, ev.id);
      deleted++;
      if (!ref.startsWith('group:')) {
        await TaskModel.updateOne(
          { userId: uid, id: ref },
          { $unset: { exportedEventId: 1, exportFingerprint: 1 } },
        );
      }
    } catch (e) {
      if (e instanceof GcalError && e.status === 401) throw e;
      errors++;
    }
  }

  return { created, updated, deleted, errors };
}

// ---------------------------------------------------------------------------
// Pull: primary-calendar events -> app tasks (read-only mirror)
// ---------------------------------------------------------------------------

async function pullEventsFromPrimary(
  uid: string,
  token: string,
  today: string,
  tz: string,
) {
  const dates = enumerateDays(today, IMPORT_WINDOW_DAYS);
  const timeMin = new Date(`${dates[0]}T00:00:00`).toISOString();
  const timeMax = new Date(
    new Date(`${dates[dates.length - 1]}T00:00:00`).getTime() +
      24 * 60 * 60 * 1000,
  ).toISOString();

  const fetched = await listEvents(token, 'primary', {
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const events = fetched.filter(
    (e) =>
      e.status !== 'cancelled' &&
      e.summary?.trim() &&
      !e.extendedProperties?.private?.[APP_TASK_PROP],
  );
  const fetchedEventIds = new Set(events.map((e) => e.id));

  const importedInWindow = await TaskModel.find({
    userId: uid,
    calendarEventId: { $exists: true, $ne: null },
    date: { $in: dates },
  }).lean<TaskDoc[]>();

  const staleIds = importedInWindow
    .filter(
      (t) =>
        t.calendarEventId &&
        !fetchedEventIds.has(t.calendarEventId) &&
        !t.completed,
    )
    .map((t) => t._id)
    .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId || !!id);
  if (staleIds.length > 0) {
    await TaskModel.deleteMany({ _id: { $in: staleIds } });
  }

  const known = await TaskModel.find(
    { userId: uid, calendarEventId: { $in: Array.from(fetchedEventIds) } },
    { calendarEventId: 1 },
  ).lean<Pick<TaskDoc, 'calendarEventId'>[]>();
  const knownEventIds = new Set(known.map((t) => t.calendarEventId));

  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const event of events) {
    if (knownEventIds.has(event.id)) {
      skipped++;
      continue;
    }

    const eventDateStr =
      event.start?.date ??
      (event.start?.dateTime ? event.start.dateTime.split('T')[0] : null);
    if (!eventDateStr || !dates.includes(eventDateStr)) continue;

    const dow = new Date(`${eventDateStr}T12:00:00Z`).getUTCDay() as Weekday;

    let startTime: string | undefined;
    let endTime: string | undefined;
    if (event.start?.dateTime) {
      const start = new Date(event.start.dateTime);
      if (start.getHours() !== 0 || start.getMinutes() !== 0) {
        startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      }
    }
    if (event.end?.dateTime && event.end.dateTime !== event.start?.dateTime) {
      const end = new Date(event.end.dateTime);
      endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    }

    const lastTask = await TaskModel.findOne(
      {
        userId: uid,
        $or: [
          { type: 'weekly', dayOfWeek: dow },
          { type: 'regular', date: eventDateStr },
        ],
      },
      { order: 1 },
    )
      .sort({ order: -1 })
      .lean<TaskDoc>();

    await TaskModel.create({
      userId: uid,
      type: 'regular',
      id: uuid(),
      text: event.summary!.trim(),
      order: (lastTask?.order ?? 0) + 1,
      date: eventDateStr,
      completed: false,
      createdAt: now,
      updatedAt: now,
      calendarEventId: event.id,
      tags: [],
      startTime,
      endTime,
    });
    created++;
  }

  return {
    created,
    skipped,
    deleted: staleIds.length,
    total: events.length,
  };
}

// ---------------------------------------------------------------------------

async function handleSync(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return unauth();
  }

  await connectMongo();

  let legacyToken: string | undefined;
  let timezone = 'UTC';
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    legacyToken = body.accessToken;
    timezone = body.timezone || 'UTC';
  } else {
    timezone = req.nextUrl.searchParams.get('timezone') || 'UTC';
  }

  const user = await UserModel.findById(uid)
    .select('googleCalendar calendarAccessToken')
    .lean();

  let token: string | null = null;
  try {
    token = await getAccessToken(
      uid,
      user?.googleCalendar,
      legacyToken ?? user?.calendarAccessToken,
    );
  } catch (err) {
    console.error('Calendar token refresh failed:', err);
    await UserModel.updateOne(
      { _id: uid },
      { $unset: { "googleCalendar.refreshToken": 1, "googleCalendar.accessToken": 1, "googleCalendar.accessTokenExpiresAt": 1, calendarAccessToken: 1 } },
    );
    return NextResponse.json(
      { error: 'Calendar connection expired. Please reconnect in settings.' },
      { status: 401 },
    );
  }

  if (!token) {
    return NextResponse.json(
      { error: 'Google Calendar not connected. Please connect via the UI first.' },
      { status: 400 },
    );
  }

  const today = getZonedToday(timezone);

  try {
    let pushed = { created: 0, updated: 0, deleted: 0, errors: 0 };
    if (user?.googleCalendar?.refreshToken) {
      const calendarId = await ensureAppCalendar(
        uid,
        token,
        user.googleCalendar.calendarId,
      );
      pushed = await pushTasksToCalendar(uid, token, calendarId, today, timezone);
    }

    const imported = await pullEventsFromPrimary(uid, token, today, timezone);

    return NextResponse.json({
      ok: true,
      created: imported.created,
      skipped: imported.skipped,
      deleted: imported.deleted,
      total: imported.total,
      pushed,
    });
  } catch (err) {
    if (err instanceof GcalError && err.status === 401) {
      await UserModel.updateOne(
        { _id: uid },
        { $unset: { "googleCalendar.refreshToken": 1, "googleCalendar.accessToken": 1, "googleCalendar.accessTokenExpiresAt": 1, calendarAccessToken: 1 } },
      );
      return NextResponse.json(
        { error: 'Calendar connection expired. Please reconnect in settings.' },
        { status: 401 },
      );
    }
    console.error('Calendar sync failed:', err);
    return NextResponse.json(
      { error: 'Calendar sync failed' },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}
