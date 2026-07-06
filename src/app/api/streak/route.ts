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

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const timezone = req.nextUrl.searchParams.get('timezone') || 'UTC';

    await connectMongo();
    const [user, config] = await Promise.all([
      UserModel.findById(userId).select('quests').lean(),
      loadLoginStreakConfig(),
    ]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!config.isActive) {
      return NextResponse.json({ active: false, view: null });
    }

    const todayKey = getZonedToday(timezone);
    const state = readLoginStreakState(user);
    return NextResponse.json({
      active: true,
      view: buildLoginStreakView(state, config, todayKey),
      rescue:
        state.rescue && state.rescue.offeredDayKey === todayKey
          ? state.rescue
          : null,
    });
  } catch (error) {
    console.error('Streak fetch failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Streak fetch failed' },
      { status: 400 },
    );
  }
}
