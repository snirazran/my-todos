// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/* ---------- types (daily snapshot) ---------- */
type Origin = 'weekly' | 'regular' | 'manual';

interface TaskItem {
  id: string;
  text: string;
  order: number;
  completed: boolean;
  /** Mark where the task came from; older docs may not have this yet */
  origin?: Origin;
}

interface DayRecord {
  _id?: ObjectId;
  userId: ObjectId;
  /** YYYY-MM-DD (LOCAL time) */
  date: string;
  tasks: TaskItem[];
  /** ids hidden for *this* date only (delete-today behavior) */
  suppressed?: string[];
}

/* ---------- types (unified manager collection) ---------- */
type TaskType = 'weekly' | 'regular' | 'backlog';
interface UnifiedTask {
  _id?: ObjectId;
  userId: ObjectId;
  type: TaskType;
  id: string; // logical id (stable across collections)
  text: string;
  order: number;
  dayOfWeek?: number; // weekly: 0..6
  date?: string; // regular: 'YYYY-MM-DD' (LOCAL)
  weekStart?: string; // backlog bucket marker (unused here)
}

/* ---------- helpers: LOCAL calendar (matches /manage-tasks) ---------- */
const pad = (n: number) => String(n).padStart(2, '0');

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function dowLocalFromYMD(ymd: string) {
  // interpret the YYYY-MM-DD in *local* time (00:00 local)
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.getDay(); // 0..6 Sun..Sat
}

/* ====================================================================== */
/* GET: read/seed/merge/prune daily snapshot                              */
/* ====================================================================== */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    // default to *local* today
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const todayLocal = ymdLocal(new Date());
    const date = dateParam ?? todayLocal;

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const daysCol = db.collection<DayRecord>('dailyTasks');
    const tasksCol = db.collection<UnifiedTask>('tasks');

    const dow = dowLocalFromYMD(date);

    // 1) Fetch unified template for this day: weekly(dow) + regular(date)
    const unified = await tasksCol
      .find(
        {
          userId,
          $or: [
            { type: 'weekly', dayOfWeek: dow },
            { type: 'regular', date },
          ],
        },
        { projection: { id: 1, text: 1, order: 1, type: 1 } }
      )
      .sort({ order: 1 })
      .toArray();

    // For UI: which ids are weekly (used for "remove from week" option)
    const weeklyIdsForUI = new Set(
      unified.filter((t) => t.type === 'weekly').map((t) => t.id)
    );

    // 2) Ensure a daily snapshot doc exists
    await daysCol.updateOne(
      { userId, date },
      { $setOnInsert: { userId, date, tasks: [], suppressed: [] } },
      { upsert: true }
    );

    // 3) Load snapshot + build today's template (respect suppressed)
    let dayRecord = await daysCol.findOne({ userId, date });
    const suppressed = dayRecord?.suppressed ?? [];

    const templateFiltered: TaskItem[] = unified
      .filter((t) => !suppressed.includes(t.id))
      .map((t) => ({
        id: t.id,
        text: t.text,
        order: t.order ?? 0,
        completed: false,
        origin:
          (t.type as Origin) === 'weekly' || (t.type as Origin) === 'regular'
            ? (t.type as Origin)
            : 'manual', // shouldn't happen for unified query, but safe default
      }));

    // Fast map for lookups
    const templateById = new Map(
      templateFiltered.map((t) => [t.id, t] as const)
    );

    // 4) If brand new or empty → seed with filtered template (with origin + completed=false)
    if (!dayRecord || (dayRecord.tasks?.length ?? 0) === 0) {
      if (templateFiltered.length) {
        await daysCol.updateOne(
          { userId, date },
          { $set: { tasks: templateFiltered } }
        );
        dayRecord = await daysCol.findOne({ userId, date });
      }
    }

    // Ensure we have a runtime copy to modify safely
    const currentTasks: TaskItem[] = (dayRecord?.tasks ?? []).slice();

    // 5) Retro-tag: mark any existing tasks that are in today's template
    // as origin 'weekly'/'regular' if they lack an origin.
    let mutated = false;
    for (let i = 0; i < currentTasks.length; i++) {
      const t = currentTasks[i];
      if (!t.origin && templateById.has(t.id)) {
        const tpl = templateById.get(t.id)!;
        currentTasks[i] = { ...t, origin: tpl.origin as Origin };
        mutated = true;
      }
    }

    // 6) Prune: remove templated (weekly/regular) tasks that no longer exist in the template
    // Keep 'manual' tasks intact.
    const allowedIds = new Set(templateFiltered.map((t) => t.id));
    const prunedTasks = currentTasks.filter((t) => {
      if (t.origin === 'weekly' || t.origin === 'regular') {
        return allowedIds.has(t.id);
      }
      // No origin => treat as manual (user-added for the day)
      return true;
    });
    if (prunedTasks.length !== currentTasks.length) mutated = true;

    // 7) Merge: add any newly added template tasks that aren't present (completed=false)
    const presentIds = new Set(prunedTasks.map((t) => t.id));
    const missing = templateFiltered.filter((tpl) => !presentIds.has(tpl.id));
    let mergedTasks = prunedTasks;
    if (missing.length) {
      mergedTasks = prunedTasks.concat(
        missing.map((m) => ({ ...m, completed: false }))
      );
      mutated = true;
    }

    // 8) Sync order from manager for templated items (preserve completed + manual order)
    const synced = mergedTasks.map((t) => {
      if (t.origin === 'weekly' || t.origin === 'regular') {
        const tpl = templateById.get(t.id);
        if (tpl && tpl.order !== t.order) {
          mutated = true;
          return { ...t, order: tpl.order };
        }
      }
      return t;
    });

    // 9) Sort by order (stable display)
    const finalTasks = synced
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // 10) Write back only if changed
    if (mutated) {
      await daysCol.updateOne(
        { userId, date },
        { $set: { tasks: finalTasks } }
      );
      dayRecord = await daysCol.findOne({ userId, date });
    }

    return NextResponse.json({
      date,
      tasks: (dayRecord?.tasks ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      weeklyIds: Array.from(weeklyIdsForUI),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/* ====================================================================== */
/* PUT: toggle completion for a task in the daily snapshot                */
/* ====================================================================== */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { date, taskId, completed } = await request.json();
  if (!date || !taskId || typeof completed !== 'boolean') {
    return NextResponse.json(
      { error: 'date, taskId and completed(boolean) are required' },
      { status: 400 }
    );
  }

  const userId = new ObjectId(session.user.id);
  const client = await clientPromise;
  const daysCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  const r = await daysCol.updateOne(
    { userId, date, 'tasks.id': taskId },
    { $set: { 'tasks.$.completed': !!completed } }
  );

  if (r.matchedCount === 0) {
    return NextResponse.json(
      { error: 'Day or task not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* DELETE: remove from today's list and suppress reinjection for this day */
/* ====================================================================== */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const { date, taskId } = await request.json();
  if (!date || !taskId) {
    return NextResponse.json(
      { error: 'date and taskId are required' },
      { status: 400 }
    );
  }

  const userId = new ObjectId(session.user.id);
  const client = await clientPromise;
  const daysCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  // Remove from today's list and remember it in suppressed so GET won't re-inject it
  const r = await daysCol.updateOne(
    { userId, date },
    {
      $pull: { tasks: { id: taskId } } as any,
      $addToSet: { suppressed: taskId },
    }
  );

  if (!r.matchedCount) {
    return NextResponse.json({ error: 'Day not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
