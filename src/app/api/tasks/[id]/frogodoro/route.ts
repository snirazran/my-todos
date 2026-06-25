import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
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
      await addFrogodoroSession(
        userId,
        id,
        session.date,
        session.focusTime ?? 0,
        session.breakTime ?? 0,
      );
      isModified = true;
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
