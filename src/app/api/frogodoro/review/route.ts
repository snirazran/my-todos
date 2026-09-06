import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FocusSessionModel from '@/lib/models/FocusSession';
import TaskModel from '@/lib/models/Task';
import { getZonedToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// A review that nobody came back for stops being worth asking about: the
// session keeps the minutes on its subject, and the prompt is dropped rather
// than greeting the user with yesterday's bookkeeping.
const REVIEW_WINDOW_MS = 6 * 60 * 60_000;

// Under a minute is a mis-tap or a test, not a sitting worth reviewing.
const MIN_REVIEWABLE_FOCUS_SECONDS = 60;

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const timezone = url.searchParams.get('timezone') || 'UTC';
    await connectMongo();

    const today = getZonedToday(timezone);
    const cutoff = new Date(Date.now() - REVIEW_WINDOW_MS);

    await FocusSessionModel.updateMany(
      {
        userId,
        reviewState: 'pending',
        $or: [{ date: { $lt: today } }, { endedAt: { $lt: cutoff } }],
      },
      { $set: { reviewState: 'expired' } },
    ).catch(() => {});

    // The "is this worth reviewing?" test lives here, not at close time: a
    // session closes while its last flush may still be in flight, so only the
    // settled number can answer it.
    const session = await FocusSessionModel.findOne({
      userId,
      reviewState: 'pending',
      date: today,
      endedAt: { $exists: true },
      focusSeconds: { $gte: MIN_REVIEWABLE_FOCUS_SECONDS },
    })
      .sort({ endedAt: -1 })
      .lean();

    if (!session) return NextResponse.json({ session: null });

    const container = await TaskModel.findOne(
      { userId, id: session.subjectId },
      { tags: 1, focusAreaId: 1 },
    ).lean<{ tags?: string[]; focusAreaId?: string } | null>();

    return NextResponse.json({
      session: {
        id: session.id,
        date: session.date,
        subjectKind: session.subjectKind,
        subjectId: session.subjectId,
        subjectLabel: session.subjectLabel,
        subjectTags: container?.tags ?? [],
        subjectAreaId: container?.focusAreaId ?? '',
        focusSeconds: session.focusSeconds ?? 0,
        breakSeconds: session.breakSeconds ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const taskIds = Array.isArray(body.taskIds)
      ? Array.from(
          new Set(
            body.taskIds
              .filter((id: unknown): id is string => typeof id === 'string')
              .slice(0, 50),
          ),
        )
      : [];

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 });
    }

    await connectMongo();

    const updated = await FocusSessionModel.findOneAndUpdate(
      { userId, id: sessionId },
      {
        $set: {
          taskIds,
          reviewState: 'done',
          reviewedAt: new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, linked: taskIds.length });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
