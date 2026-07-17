import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const user = await UserModel.findOneAndUpdate(
      { _id: userId, 'wardrobe.stolenFlies': { $gt: 0 } },
      [
        {
          $set: {
            'wardrobe.flies': {
              $add: [
                { $ifNull: ['$wardrobe.flies', 0] },
                { $ifNull: ['$wardrobe.stolenFlies', 0] },
              ],
            },
            'wardrobe.stolenFlies': 0,
          },
        },
      ],
      {
        new: false,
        projection: {
          'wardrobe.flies': 1,
          'wardrobe.stolenFlies': 1,
          premiumUntil: 1,
        },
      },
    ).lean();

    const amount = user?.wardrobe?.stolenFlies ?? 0;
    if (amount <= 0) {
      return NextResponse.json(
        { granted: false, error: 'These flies were already recovered' },
        { status: 409 },
      );
    }

    const balance = (user?.wardrobe?.flies ?? 0) + amount;
    const isPremium =
      !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();

    await Promise.all([
      recordAnalyticsEvent({
        userId,
        name: 'fly_spent',
        properties: {
          source: 'frog_hunger',
          fly_amount: amount,
          is_premium: isPremium,
        },
      }),
      recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'frog_hunger_ad_recovery',
          fly_amount: amount,
          is_premium: isPremium,
        },
      }),
    ]);

    return NextResponse.json({ granted: true, amount, balance });
  } catch (err) {
    console.error('Hunger fly recovery failed:', err);
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 });
  }
}
