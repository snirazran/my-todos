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
import { isPremiumUser } from '@/lib/quests/engine';
import {
  loadShieldConfig,
  readShieldState,
  shieldCapFor,
} from '@/lib/shields/engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const timezone = req.nextUrl.searchParams.get('timezone') || 'UTC';

    await connectMongo();
    const [user, config, shieldConfig] = await Promise.all([
      UserModel.findById(userId).select('quests premiumUntil').lean(),
      loadLoginStreakConfig(),
      loadShieldConfig(),
    ]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!config.isActive) {
      return NextResponse.json({ active: false, view: null });
    }

    const todayKey = getZonedToday(timezone);
    const state = readLoginStreakState(user);
    const shieldState = readShieldState(user);
    return NextResponse.json({
      active: true,
      view: buildLoginStreakView(state, config, todayKey, {
        count: shieldState.count,
        cap: shieldCapFor(shieldConfig, isPremiumUser(user as any)),
      }),
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
