// src/app/api/time-tracker/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = String(session.user.id);

  const { searchParams } = new URL(req.url);
  const dateKey =
    searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection('timeEntries');

  const docs = await col.find({ userId, dateKey }).sort({ start: 1 }).toArray();

  const sessions = docs.map((d: any) => ({
    id: d._id.toString(),
    task: d.task,
    category: d.category,
    start: d.start,
    end: d.end,
    durationMs: d.durationMs,
    plannedMinutes: d.plannedMinutes ?? null,
    dateKey: d.dateKey,
  }));

  const totalMs = sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  return NextResponse.json({ sessions, totalMs });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = String(session.user.id);

  const body = await req.json();

  const {
    mode, // 'timer' | 'manual'
    task,
    category,
    start,
    end,
    durationMs,
    durationMinutes,
    dateKey: clientDateKey,
    plannedMinutes,
  } = body || {};

  if (!task || !category) {
    return NextResponse.json(
      { error: 'Missing task or category' },
      { status: 400 }
    );
  }

  const clientDate =
    clientDateKey ||
    (start || end
      ? new Date(start || end).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  let finalDurationMs = 0;
  let startDate: Date;
  let endDate: Date;

  if (mode === 'manual') {
    if (!durationMinutes || !clientDate) {
      return NextResponse.json(
        { error: 'Manual mode requires durationMinutes and dateKey' },
        { status: 400 }
      );
    }
    finalDurationMs = durationMinutes * 60_000;

    // Start/end are mostly informational; dateKey is used for grouping
    startDate = new Date();
    endDate = new Date(startDate.getTime() + finalDurationMs);
  } else {
    // timer mode
    if (!durationMs && (!start || !end)) {
      return NextResponse.json(
        { error: 'Timer mode requires durationMs or start+end' },
        { status: 400 }
      );
    }
    if (durationMs) {
      finalDurationMs = durationMs;
    } else {
      const s = new Date(start);
      const e = new Date(end);
      finalDurationMs = Math.max(0, e.getTime() - s.getTime());
    }
    startDate = start ? new Date(start) : new Date();
    endDate = end ? new Date(end) : new Date();
  }

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection('timeEntries');

  const doc = {
    userId,
    task: String(task),
    category: String(category),
    start: startDate,
    end: endDate,
    durationMs: finalDurationMs,
    plannedMinutes: plannedMinutes ?? null,
    dateKey: clientDate,
    createdAt: new Date(),
  };

  const result = await col.insertOne(doc);

  return NextResponse.json(
    {
      id: result.insertedId.toString(),
      ...doc,
    },
    { status: 201 }
  );
}
