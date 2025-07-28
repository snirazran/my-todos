import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { v4 as uuid } from 'uuid';
import clientPromise from '@/lib/mongodb';

interface WeeklyTask {
  id: string;
  text: string;
  order: number;
}
interface WeeklyDoc {
  _id?: ObjectId;
  dayOfWeek: number;
  tasks: WeeklyTask[];
}

const getCol = async () =>
  (await clientPromise).db('todoTracker').collection<WeeklyDoc>('weeklyTasks');

/* ---------- GET ----------
 * /api/manage-tasks           -> whole week
 * /api/manage-tasks?day=3     -> Wednesday only
 */
export async function GET(req: NextRequest) {
  const day = req.nextUrl.searchParams.get('day');
  const col = await getCol();

  if (day !== null) {
    const doc = await col.findOne({ dayOfWeek: +day });
    return NextResponse.json(doc?.tasks ?? []);
  }
  // whole week – return an array[7] so the client has fixed order
  const docs = await col.find().toArray();
  const week: WeeklyTask[][] = Array.from({ length: 7 }, () => []);
  docs.forEach((d) => (week[d.dayOfWeek] = d.tasks));
  return NextResponse.json(week);
}

/* ---------- POST ----------
 * body: { text: string, days: number[] }
 * adds the same task‑text to every weekday in days[]
 */
export async function POST(req: NextRequest) {
  const { text, days } = await req.json();
  const col = await getCol();

  await Promise.all(
    (days as number[]).map(async (d: number) => {
      const doc = await col.findOne({ dayOfWeek: d });
      const nextOrder =
        (doc?.tasks.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;
      const newTask: WeeklyTask = { id: uuid(), text, order: nextOrder };

      await col.updateOne(
        { dayOfWeek: d },
        { $push: { tasks: newTask } },
        { upsert: true }
      );
    })
  );
  return NextResponse.json({ ok: true });
}

/* ---------- PUT ----------  (re‑order)
 * body: { day: number, tasks: WeeklyTask[] }  – already sorted by the client
 */
export async function PUT(req: NextRequest) {
  const { day, tasks } = await req.json();
  const ordered = tasks.map((t: WeeklyTask, i: number) => ({
    ...t,
    order: i + 1,
  }));
  await (
    await getCol()
  ).updateOne({ dayOfWeek: day }, { $set: { tasks: ordered } });
  return NextResponse.json({ ok: true });
}

/* ---------- DELETE ----------
 * body: { day: number, taskId: string }
 */
export async function DELETE(req: NextRequest) {
  const { day, taskId } = await req.json();
  await (
    await getCol()
  ).updateOne({ dayOfWeek: day }, { $pull: { tasks: { id: taskId } } });
  return NextResponse.json({ ok: true });
}
