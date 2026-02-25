import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireUserId();
    const { id } = params; // This is the string `id` of the task, not the ObjectId
    const body = await req.json();
    const { settings, session } = body;

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
        task.frogodoroSessions[idx].completedCycles +=
          session.completedCycles || 0;
        task.frogodoroSessions[idx].timeSpent += session.timeSpent || 0;
        if (session.targetCycles) {
          task.frogodoroSessions[idx].targetCycles = session.targetCycles;
        }
      } else {
        task.frogodoroSessions.push(session);
      }
      isModified = true;
    }

    if (isModified) {
      task.markModified('frogodoroSettings');
      task.markModified('frogodoroSessions');
      await task.save();
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
