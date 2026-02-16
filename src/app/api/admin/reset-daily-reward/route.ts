import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const { uid } = await requireAuth();
    await dbConnect();

    const user = await UserModel.findById(uid).select('dailyRewards');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentDay = new Date().getDate();

    // Remove today from claimedDays
    const currentClaimed = user.dailyRewards?.claimedDays || [];
    const updatedClaimedDays = currentClaimed.filter(
      (d: number) => d !== currentDay,
    );

    // Set lastClaimDate to yesterday so it's not "today"
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await UserModel.findByIdAndUpdate(uid, {
      $set: {
        'dailyRewards.claimedDays': updatedClaimedDays,
        'dailyRewards.lastClaimDate': yesterday,
      },
    });

    return NextResponse.json({ success: true, message: 'Daily reward reset' });
  } catch (error) {
    console.error('Reset daily reward error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
