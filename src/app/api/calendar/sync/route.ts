export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';

type CalendarEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function getRollingWeekDatesZoned(tz: string) {
  const todayYMD = getZonedToday(tz);
  const todayDate = new Date(`${todayYMD}T12:00:00Z`);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayDate);
    d.setUTCDate(todayDate.getUTCDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return { todayYMD, dates };
}

async function handleSync(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return unauth();
  }

  await connectMongo();
  
  // Try to get data from body (POST) or query (GET)
  let accessToken: string | undefined;
  let timezone = 'UTC';

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    accessToken = body.accessToken;
    timezone = body.timezone || 'UTC';
  } else {
    timezone = req.nextUrl.searchParams.get('timezone') || 'UTC';
  }

  // Fallback to stored token in DB
  if (!accessToken) {
    const user = await UserModel.findById(uid).select('calendarAccessToken').lean();
    accessToken = user?.calendarAccessToken;
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Google Calendar not connected. Please connect via the UI first.' },
      { status: 400 },
    );
  }

  const { todayYMD, dates } = getRollingWeekDatesZoned(timezone);

  // Calculate time range for the next 7 days
  const timeMin = new Date(`${dates[0]}T00:00:00`).toISOString();
  const timeMax = new Date(
    new Date(`${dates[6]}T00:00:00`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  // Fetch events from Google Calendar API
  let events: CalendarEvent[] = [];
  try {
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '100');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Google Calendar API error:', res.status, errBody);
      if (res.status === 401) {
        // Token expired, clear it
        await UserModel.findByIdAndUpdate(uid, { $unset: { calendarAccessToken: 1 } });
      }
      return NextResponse.json(
        { error: 'Calendar connection expired. Please reconnect in settings.', detail: errBody },
        { status: res.status === 401 ? 401 : 502 },
      );
    }

    const data = await res.json();
    events = data.items || [];
  } catch (err) {
    console.error('Error fetching calendar events:', err);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 502 },
    );
  }

  events = events.filter((e) => e.summary?.trim());
  const fetchedEventIds = new Set(events.map((e) => e.id));

  const existingCalTasks = await TaskModel.find({
    userId: uid,
    calendarEventId: { $exists: true, $ne: null },
    date: { $in: dates },
  }).lean<TaskDoc[]>();

  const existingEventIds = new Set(existingCalTasks.map((t) => t.calendarEventId));
  const tasksToDelete = existingCalTasks.filter(
    (t) => t.calendarEventId && !fetchedEventIds.has(t.calendarEventId)
  );

  if (tasksToDelete.length > 0) {
    const idsToDelete = tasksToDelete.map(t => t._id).filter(Boolean);
    await TaskModel.deleteMany({
      _id: { $in: idsToDelete }
    });
  }

  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const event of events) {
    if (existingEventIds.has(event.id)) {
      skipped++;
      continue;
    }

    const eventDateStr = event.start.date || (event.start.dateTime ? event.start.dateTime.split('T')[0] : null);
    if (!eventDateStr) continue;

    const dateIdx = dates.indexOf(eventDateStr);
    if (dateIdx === -1) continue;

    const eventDate = new Date(`${eventDateStr}T12:00:00Z`);
    const dow = eventDate.getUTCDay() as Weekday;

    let taskText = event.summary.trim();
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      const hours = start.getHours();
      const mins = start.getMinutes();
      if (hours !== 0 || mins !== 0) {
        startTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      }
    }
    if (event.end.dateTime && event.end.dateTime !== event.start.dateTime) {
      const end = new Date(event.end.dateTime);
      endTime = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
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
    ).sort({ order: -1 }).lean<TaskDoc>();

    const order = (lastTask?.order ?? 0) + 1;

    await TaskModel.create({
      userId: uid,
      type: 'regular',
      id: uuid(),
      text: taskText,
      order,
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

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    deleted: tasksToDelete.length,
    total: events.length,
  });
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}
