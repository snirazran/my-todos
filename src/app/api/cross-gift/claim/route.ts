export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  CROSS_GIFT_FLIES,
  otherPlatform,
  type CrossGiftPlatform,
} from '@/lib/crossGift';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { platform?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body handled below */
  }
  const platform = body.platform as CrossGiftPlatform;
  if (platform !== 'web' && platform !== 'native') {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  try {
    await connectMongo();

    const result = await UserModel.updateOne(
      {
        _id: userId,
        crossGiftBonus: null,
        [`platformsSeen.${otherPlatform(platform)}`]: { $exists: true },
        // The move-to-web quest pays these users instead.
        'quests.moveToWeb.startedAt': { $exists: false },
      },
      {
        $set: {
          crossGiftBonus: {
            platform,
            flies: CROSS_GIFT_FLIES,
            claimedAt: new Date(),
          },
          [`platformsSeen.${platform}`]: new Date(),
        },
        $inc: { 'wardrobe.flies': CROSS_GIFT_FLIES },
      },
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: 'Gift not claimable' },
        { status: 409 },
      );
    }
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: { source: 'cross_platform_gift', fly_amount: CROSS_GIFT_FLIES, is_premium: false },
    });

    return NextResponse.json({ ok: true, flies: CROSS_GIFT_FLIES });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
