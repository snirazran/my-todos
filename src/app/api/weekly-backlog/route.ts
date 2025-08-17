// src/app/api/weekly-backlog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { v4 as uuid } from 'uuid';

interface WeeklyBacklogDoc {
  userId: ObjectId;
  weekStart: string; // LOCAL Sunday YYYY-MM-DD
  tasks: { id: string; text: string; order: number; completed: boolean }[];
}

/* local helpers (LOCAL time) */
function atLocalMidnight(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sundayOf(date = new Date()) {
  const base = atLocalMidnight(date);
  const sun = new Date(base);
  sun.setDate(base.getDate() - base.getDay()); // 0=Sun..6=Sat
  return sun;
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function uid() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? new ObjectId(s.user.id) : null;
}

export async function GET() {
  const userId = await uid();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const weekStart = ymdLocal(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');

  const doc = await col.findOne({ userId, weekStart });
  const tasks = (doc?.tasks ?? []).slice().sort((a, b) => a.order - b.order);
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { text } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const weekStart = ymdLocal(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');

  // STEP 1: ensure the doc exists (no 'tasks' field here)
  await col.updateOne(
    { userId, weekStart },
    { $setOnInsert: { userId, weekStart, tasks: [] } },
    { upsert: true }
  );

  // Compute next order after ensuring existence
  const current = await col.findOne({ userId, weekStart });
  const nextOrder =
    (current?.tasks?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

  // STEP 2: push the task (safe—no path conflict)
  const newTask = { id: uuid(), text, order: nextOrder, completed: false };
  await col.updateOne({ userId, weekStart }, { $push: { tasks: newTask } });

  return NextResponse.json({ ok: true, task: newTask });
}

export async function DELETE(req: NextRequest) {
  const userId = await uid();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const { taskId } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  const weekStart = ymdLocal(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');

  await col.updateOne(
    { userId, weekStart },
    { $pull: { tasks: { id: taskId } } }
  );
  return NextResponse.json({ ok: true });
}
