import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  loadLoginStreakConfig,
  readLoginStreakState,
} from '@/lib/streak/loginStreak';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const config = await loadLoginStreakConfig();
    if (!config.isActive) {
      return NextResponse.json(
        { error: 'Streak freezes are not available right now' },
        { status: 400 },
      );
    }

    const price = config.freezePriceFlies;
    const res = await UserModel.updateOne(
      {
        _id: userId,
        'wardrobe.flies': { $gte: price },
        'quests.loginStreak.freezes': { $lt: config.freezeCap },
      },
      {
        $inc: {
          'wardrobe.flies': -price,
          'quests.loginStreak.freezes': 1,
        },
      },
    );

    if (res.modifiedCount === 0) {
      const user = await UserModel.findById(userId)
        .select('wardrobe.flies quests')
        .lean();
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const state = readLoginStreakState(user);
      if (state.freezes >= config.freezeCap) {
        return NextResponse.json(
          { error: 'Freeze limit reached' },
          { status: 409 },
        );
      }
      if (!(user as any).quests?.loginStreak) {
        return NextResponse.json(
          { error: 'Check in once before buying freezes' },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: 'Not enough flies' }, { status: 400 });
    }

    const fresh = await UserModel.findById(userId)
      .select('wardrobe.flies quests premiumUntil')
      .lean();
    const state = readLoginStreakState(fresh);
    await recordAnalyticsEvent({
      userId,
      name: 'fly_spent',
      properties: {
        source: 'streak_freeze',
        fly_amount: price,
        is_premium: !!fresh?.premiumUntil && new Date(fresh.premiumUntil) > new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      freezes: state.freezes,
      flyBalance: (fresh as any)?.wardrobe?.flies ?? 0,
    });
  } catch (error) {
    console.error('Freeze purchase failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Purchase failed' },
      { status: 400 },
    );
  }
}
