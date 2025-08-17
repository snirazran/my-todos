// src/app/api/weekly-backlog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { v4 as uuid } from 'uuid';

interface WeeklyBacklogDoc {
  userId: ObjectId;
  weekStart: string; // Sunday YYYY-MM-DD
  tasks: { id: string; text: string; order: number; completed: boolean }[];
}

function sundayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}
function ymd(d: Date) {
  return d.toISOString().split('T')[0];
}

async function uid() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? new ObjectId(s.user.id) : null;
}

export async function GET() {
  const userId = await uid();
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const weekStart = ymd(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');
  const doc = await col.findOne({ userId, weekStart });
  return NextResponse.json(doc?.tasks ?? []);
}

export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { text } = await req.json();
  const weekStart = ymd(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');
  const doc = await col.findOne({ userId, weekStart });
  const nextOrder =
    (doc?.tasks?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

  await col.updateOne(
    { userId, weekStart },
    {
      $setOnInsert: { userId, weekStart, tasks: [] },
      $push: {
        tasks: { id: uuid(), text, order: nextOrder, completed: false },
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await uid();
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const { taskId } = await req.json();

  const weekStart = ymd(sundayOf());
  const col = (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');
  await col.updateOne(
    { userId, weekStart },
    { $pull: { tasks: { id: taskId } } }
  );

  return NextResponse.json({ ok: true });
}
