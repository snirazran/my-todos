import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  cancelFrogodoroTimerProcessing,
  scheduleFrogodoroTimerProcessing,
} from '@/lib/frogodoroDelayedTimer';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import type { PomodoroPhase } from '@/lib/frogodoroStore';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

const phases = new Set<PomodoroPhase>(['focus', 'break']);
const statuses = new Set(['running', 'paused']);
const defaultSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  timerSound: 'dreamscape' as const,
};
const defaultSessionStats = {
  focusTime: 0,
  breakTime: 0,
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
      serverNow: Date.now(),
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
    const existing = await UserModel.findById(userId, {
      'activeFrogodoroTimer.rev': 1,
    }).lean();
    const prevRev =
      (existing as { activeFrogodoroTimer?: { rev?: number } } | null)
        ?.activeFrogodoroTimer?.rev ?? 0;
    const stored: ActiveFrogodoroTimer = { ...timer, rev: prevRev + 1 };

    await UserModel.updateOne(
      { _id: userId },
      { $set: { activeFrogodoroTimer: stored } },
    );
    publishTimerEvent(userId, stored);

    if (stored.status === 'running' && stored.endsAt) {
      scheduleFrogodoroTimerProcessing({
        userId,
        endsAt: stored.endsAt,
      });
    } else {
      cancelFrogodoroTimerProcessing(userId);
    }

    return NextResponse.json({ timer: stored, serverNow: Date.now() });
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
    publishTimerEvent(userId, null);
    cancelFrogodoroTimerProcessing(userId);

    return NextResponse.json({ timer: null, serverNow: Date.now() });
  } catch {
    return unauth();
  }
}
