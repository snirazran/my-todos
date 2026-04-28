import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import type { PomodoroPhase } from '@/lib/frogodoroStore';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

const phases = new Set<PomodoroPhase>(['focus', 'shortBreak', 'longBreak']);
const statuses = new Set(['running', 'paused']);
const defaultSettings = {
  cycleDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 30,
  longBreakInterval: 3,
  autoStartBreaks: false,
  timerSound: 'bell' as const,
};
const defaultSessionStats = {
  focusSessions: 0,
  shortBreaks: 0,
  longBreaks: 0,
  focusTime: 0,
  shortBreakTime: 0,
  longBreakTime: 0,
};

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function normalizeTimer(input: unknown): ActiveFrogodoroTimer | null {
  if (!input || typeof input !== 'object') return null;

  const timer = input as Partial<ActiveFrogodoroTimer>;
  if (
    typeof timer.taskId !== 'string' ||
    !phases.has(timer.phase as PomodoroPhase) ||
    !statuses.has(timer.status ?? '') ||
    typeof timer.timeLeft !== 'number'
  ) {
    return null;
  }

  const phase = timer.phase as PomodoroPhase;
  const status = timer.status as 'running' | 'paused';

  return {
    taskId: timer.taskId,
    clientId: typeof timer.clientId === 'string' ? timer.clientId : undefined,
    phase,
    status,
    timeLeft: Math.max(0, Math.floor(timer.timeLeft)),
    endsAt: typeof timer.endsAt === 'string' ? timer.endsAt : null,
    settings: {
      ...defaultSettings,
      ...(timer.settings ?? {}),
    },
    completedCycles: Math.max(0, Math.floor(timer.completedCycles ?? 0)),
    sessionStats: {
      ...defaultSessionStats,
      ...(timer.sessionStats ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
    }).lean();

    return NextResponse.json({
      timer: user?.activeFrogodoroTimer ?? null,
    });
  } catch {
    return unauth();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timer = normalizeTimer(body?.timer);

    if (!timer) {
      return NextResponse.json({ error: 'Invalid timer' }, { status: 400 });
    }

    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $set: { activeFrogodoroTimer: timer } },
    );

    return NextResponse.json({ timer });
  } catch {
    return unauth();
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $set: { activeFrogodoroTimer: null } },
    );

    return NextResponse.json({ timer: null });
  } catch {
    return unauth();
  }
}
