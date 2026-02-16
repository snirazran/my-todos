import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getCurrentMonthKey } from '@/lib/dailyRewards';

export async function GET() {
  try {
    const { uid } = await requireAuth();
    await dbConnect();

    const user = await UserModel.findById(uid).select(
      'dailyRewards premiumUntil',
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const todayString = getCurrentMonthKey();
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
