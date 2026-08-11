import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import { addFrogodoroSession } from '@/lib/frogodoroSessions';
import { syncQuestState } from '@/lib/quests/engine';
import { notifyTaskChanged } from '@/lib/taskSync';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params; // This is the string `id` of the task, not the ObjectId
    const body = await req.json();
    const { settings, session, timezone = 'UTC' } = body;

    await connectMongo();

    const exists = await TaskModel.exists({ id, userId });
    if (!exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    let isModified = false;

    if (settings && typeof settings === 'object') {
      const setOps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(settings)) {
        setOps[`frogodoroSettings.${key}`] = value;
      }
      if (Object.keys(setOps).length > 0) {
        await TaskModel.updateOne({ id, userId }, { $set: setOps });
        isModified = true;
      }
    }

    if (session && session.date) {
      const activePhaseElapsed = Number(body.activePhaseElapsed);
      const activePhaseFull = Number(body.activePhaseFull);
      const activePhase =
        body.activePhase === 'break' ? 'break' : ('focus' as const);

      // A flush that names a live focus phase is mid-session, so its flies land
      // on the phase's own catch marks. One that doesn't — Stop, a task switch,
      // the offline completion save, or a client too old to send the phase
      // length — settles on the day curve instead. Either way the phase's total
      // payout is the same; only the moment it lands moves.
      const runningPhase =
        activePhase === 'focus' &&
        Number.isFinite(activePhaseElapsed) &&
        activePhaseElapsed > 0 &&
        Number.isFinite(activePhaseFull) &&
        activePhaseFull >= 60 &&
        activePhaseFull <= 24 * 60 * 60
          ? {
              fullSeconds: Math.floor(activePhaseFull),
              elapsedSeconds: Math.min(
                Math.floor(activePhaseElapsed),
                Math.floor(activePhaseFull),
              ),
            }
          : null;

      await addFrogodoroSession(
        userId,
        id,
        session.date,
        session.focusTime ?? 0,
        session.breakTime ?? 0,
        runningPhase,
      );
      isModified = true;

      // Record how much of the current phase has been persisted so the
      // phase-completion save (frogodoroTimerProcessor) only adds the
      // remainder instead of the full duration.
      if (Number.isFinite(activePhaseElapsed) && activePhaseElapsed > 0) {
        await UserModel.updateOne(
          {
            _id: userId,
            'activeFrogodoroTimer.taskId': id,
            'activeFrogodoroTimer.phase': activePhase,
          },
          {
            $max: {
              'activeFrogodoroTimer.savedElapsed': Math.floor(
                activePhaseElapsed,
              ),
            },
          },
        ).catch(() => {});
      }
    }

    if (isModified) {
      await notifyTaskChanged(userId);
      void syncQuestState({ userId, timezone }).catch((syncError) => {
        console.error('Quest sync failed after frogodoro update:', syncError);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Frogodoro API error:', error);
    return NextResponse.json(
      { error: 'Failed to update frogodoro data' },
      { status: 500 },
    );
  }
}
