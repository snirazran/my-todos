export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  AD_FLY_DAILY_CAP,
  AD_FLY_REWARD,
  adFliesRemaining,
  type AdFlyDaily,
} from '@/lib/rewards/adFlies';

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';

  try {
    await connectMongo();
    const user = await UserModel.findById(userId).select('adFlyDaily').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const today = getZonedToday(tz);
    return NextResponse.json({
      reward: AD_FLY_REWARD,
      cap: AD_FLY_DAILY_CAP,
      remaining: adFliesRemaining((user as any).adFlyDaily, today),
    });
  } catch (err) {
    console.error('Ad fly status failed:', err);
    return NextResponse.json({ error: 'Status failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { timezone?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → UTC */
  }
  const tz = body.timezone || 'UTC';

  try {
    await connectMongo();
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = getZonedToday(tz);
    const prev = (user as any).adFlyDaily as AdFlyDaily | undefined;
    const count = prev && prev.date === today ? prev.count : 0;

    if (count >= AD_FLY_DAILY_CAP) {
      return NextResponse.json({
        granted: false,
        reward: AD_FLY_REWARD,
        cap: AD_FLY_DAILY_CAP,
        remaining: 0,
      });
    }

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.flies = (user.wardrobe.flies ?? 0) + AD_FLY_REWARD;
    (user as any).adFlyDaily = { date: today, count: count + 1 };
    user.markModified('adFlyDaily');
    user.markModified('wardrobe');
    await user.save();

    return NextResponse.json({
      granted: true,
      amount: AD_FLY_REWARD,
      balance: user.wardrobe.flies,
      reward: AD_FLY_REWARD,
      cap: AD_FLY_DAILY_CAP,
      remaining: AD_FLY_DAILY_CAP - (count + 1),
    });
  } catch (err) {
    console.error('Ad fly reward failed:', err);
    return NextResponse.json({ error: 'Reward failed' }, { status: 500 });
  }
}
