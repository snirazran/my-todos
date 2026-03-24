export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getCurrentMonthKey } from '@/lib/dailyRewards';

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth();
    await dbConnect();

    const user = await UserModel.findById(uid).select(
      'dailyRewards premiumUntil',
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use client timezone from query param to determine current month
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get('timezone');
    let todayString: string;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
      });
      const parts = fmt.formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')!.value;
      const m = parts.find((p) => p.type === 'month')!.value;
      todayString = `${y}-${m}`;
    } catch {
      todayString = getCurrentMonthKey();
    }
    let userRewards = user.dailyRewards;

    // Reset if new month
    if (!userRewards || userRewards.month !== todayString) {
      userRewards = {
        lastClaimDate: null,
        claimedDays: [],
        month: todayString,
        streak: 0,
      };
      // Ideally we save this reset, but for GET just returning clean state is OK.
      // The claiming logic will handle the actual DB update if needed,
      // or we can lazy-update here. Let's lazy-update to keep DB in sync.
      await UserModel.findByIdAndUpdate(uid, {
        $set: { dailyRewards: userRewards },
      });
    }

    return NextResponse.json({
      dailyRewards: userRewards,
      isPremium: user.premiumUntil
        ? new Date(user.premiumUntil) > new Date()
        : false,
    });
  } catch (error) {
    console.error('Error fetching daily rewards:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
