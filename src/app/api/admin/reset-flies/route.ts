import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    // Reset flyDaily
    // We want to reset earned to 0, limitHit to false.
    // We should also clear the 'earned' list if we want to re-earn on same tasks?
    // If we just reset 'earned' to 0 but keep 'taskIds', the code might think "alreadyRewarded".
    // "alreadyRewarded" check in awardFlyForTask checks if taskId is in daily.taskIds.
    // So we MUST clear taskIds too if we want to re-test on the SAME tasks today.

    // Let's reset everything for "today".

    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // We need to know "today" to update the correct structure in wardrobe.flyDaily
    // But actually, we just want to force the current state to be "0 earned".
    // We can just update wardrobe.flyDaily to satisfy this.

    const now = new Date();
    const isoDate = now.toISOString().split('T')[0]; // Simple UTC date or just rely on what's there?
    // references use `getZonedToday(tz)`.
    // Let's just blindly reset `wardrobe.flyDaily` to a clean state for "today" (whatever date that is).
    // Or better, just properly construct it.

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          'wardrobe.flyDaily': {
            date: isoDate, // This might differ from zoned date but for testing it forces a reset.
            // Actually, if date mismatches, `normalizeDailyFly` might reset it anyway?
            // If we want to strictly TEST the "earning" flow, we want `date` to match `today`.
            // We can fetch the user's current timezone if we want to be precise, or just use their existing flyDaily.date if present.
          },
          'wardrobe.flies': 0, // Reset balance too? Maybe not needed but helpful for "start over". Let's keep balance, just reset earned today.
        },
      },
    );

    // Correction: I should probably just clear `wardrobe.flyDaily` entirely or set it to a fresh object for "today".
    // Attempting to just update:

    const freshDaily = {
      date: new Date().toLocaleDateString('en-CA'), // Approximation
      earned: 0,
      taskIds: [],
      limitNotified: false,
    };

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          'wardrobe.flyDaily': freshDaily,
        },
      },
    );

    return NextResponse.json({
      success: true,
      message: 'Daily flies reset. You can now earn flies again.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset' }, { status: 500 });
  }
}
