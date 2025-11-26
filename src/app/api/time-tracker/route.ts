// src/app/api/time-tracker/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import TimeEntryModel, { type TimeEntryDoc } from '@/lib/models/TimeEntry';

/* ---------- helpers ---------- */
async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new Types.ObjectId(session.user.id) : null;
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/* ============================== GET ============================== */
// GET /api/time-tracker?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { searchParams } = req.nextUrl;
  const dateKey =
    searchParams.get('date') || new Date().toISOString().slice(0, 10);

  await connectMongo();

  const docs = await TimeEntryModel.find({ userId: uid, dateKey })
    .sort({ start: 1 })
    .lean<TimeEntryDoc>()
    .exec();

  const sessions = docs.map((d) => ({
    id: d._id!.toString(),
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

/* ============================== POST ============================== */
// POST /api/time-tracker
// body: see explanation in previous message (mode: 'timer' | 'manual', etc.)
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

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

  const dateKey =
    clientDateKey ||
    (start || end
      ? new Date(start || end).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  let finalDurationMs = 0;
  let startDate: Date;
  let endDate: Date;

  if (mode === 'manual') {
    if (!durationMinutes || !dateKey) {
      return NextResponse.json(
        { error: 'Manual mode requires durationMinutes and dateKey' },
        { status: 400 }
      );
    }
    finalDurationMs = durationMinutes * 60_000;

    // Mostly informational; dateKey is what you group by
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

  await connectMongo();

  const doc: TimeEntryDoc = {
    userId: uid,
    task: String(task),
    category: String(category),
    start: startDate,
    end: endDate,
    durationMs: finalDurationMs,
    plannedMinutes: plannedMinutes ?? null,
    dateKey,
    createdAt: new Date(),
  };

  const result = await TimeEntryModel.create(doc);

  return NextResponse.json(
    {
      id: result._id.toString(),
      ...doc,
    },
    { status: 201 }
  );
}
