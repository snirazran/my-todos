import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    await connectMongo();

    const user = await UserModel.findOneAndUpdate(
      { _id: userId, 'wardrobe.stolenFlies': { $gt: 0 } },
      { $set: { 'wardrobe.stolenFlies': 0 } },
      { new: false, projection: { 'wardrobe.stolenFlies': 1, premiumUntil: 1 } },
    ).lean();
    const amount = user?.wardrobe?.stolenFlies ?? 0;
    if (amount > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_spent',
        properties: {
          source: 'frog_hunger',
          fly_amount: amount,
          is_premium: !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
