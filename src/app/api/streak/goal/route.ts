import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  buildLoginStreakView,
  loadLoginStreakConfig,
  readLoginStreakState,
} from '@/lib/streak/loginStreak';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const days = Math.floor(Number(body.days));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    await connectMongo();
    const config = await loadLoginStreakConfig();
    if (!config.isActive) {
      return NextResponse.json(
        { error: 'Streak goals are not available right now' },
        { status: 400 },
      );
    }
    if (!config.goalTiers.some((t) => t.days === days)) {
      return NextResponse.json({ error: 'Invalid goal' }, { status: 400 });
    }

    const user = await UserModel.findById(userId).select('quests').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const state = readLoginStreakState(user);
    if (state.goal) {
      return NextResponse.json(
        { error: 'You already have an active goal' },
        { status: 409 },
      );
    }
    if (!(user as any).quests?.loginStreak) {
      return NextResponse.json(
        { error: 'Check in once before setting a goal' },
        { status: 400 },
      );
    }

    const todayKey = getZonedToday(timezone);
    const goal = { days, startCount: state.count, startDayKey: todayKey };
    const res = await UserModel.updateOne(
      {
        _id: userId,
        $or: [
          { 'quests.loginStreak.goal': null },
          { 'quests.loginStreak.goal': { $exists: false } },
        ],
      },
      { $set: { 'quests.loginStreak.goal': goal } },
    );
    if (res.modifiedCount === 0) {
      return NextResponse.json(
        { error: 'You already have an active goal' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      view: buildLoginStreakView({ ...state, goal }, config, todayKey),
    });
  } catch (error) {
    console.error('Streak goal failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Goal update failed' },
      { status: 400 },
    );
  }
}
