import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import { syncQuestState } from '@/lib/quests/engine';

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

    const task = await TaskModel.findOne({ id, userId });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    let isModified = false;

    // Update settings if provided
    if (settings) {
      task.frogodoroSettings = {
        ...task.frogodoroSettings,
        ...settings,
      };
      isModified = true;
    }

    // Update session if provided
    if (session && session.date) {
      if (!task.frogodoroSessions) {
        task.frogodoroSessions = [];
      }

      const idx = task.frogodoroSessions.findIndex(
        (s: any) => s.date === session.date,
      );

      if (idx !== -1) {
        task.frogodoroSessions[idx].focusTime =
          (task.frogodoroSessions[idx].focusTime ?? 0) + (session.focusTime ?? 0);
        task.frogodoroSessions[idx].breakTime =
          (task.frogodoroSessions[idx].breakTime ?? 0) + (session.breakTime ?? 0);
      } else {
        task.frogodoroSessions.push({
          date: session.date,
          focusTime: session.focusTime ?? 0,
          breakTime: session.breakTime ?? 0,
        });
      }
      isModified = true;
    }

    if (isModified) {
      task.markModified('frogodoroSettings');
      task.markModified('frogodoroSessions');
      await task.save();
      void syncQuestState({ userId, timezone }).catch((syncError) => {
        console.error('Quest sync failed after frogodoro update:', syncError);
      });
    }

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Frogodoro API error:', error);
    return NextResponse.json(
      { error: 'Failed to update frogodoro data' },
      { status: 500 },
    );
  }
}
