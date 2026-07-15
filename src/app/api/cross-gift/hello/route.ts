export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  CROSS_GIFT_FLIES,
  otherPlatform,
  type CrossGiftPlatform,
  type CrossGiftStatus,
} from '@/lib/crossGift';
import { hasMoveToWebQuest } from '@/lib/quests/moveToWeb';

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

    const user = await UserModel.findById(userId)
      .select('platformsSeen crossGiftBonus quests')
      .lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const firstSeen = !user.platformsSeen?.[platform];
    if (firstSeen) {
      await UserModel.updateOne(
        { _id: userId, [`platformsSeen.${platform}`]: { $exists: false } },
        { $set: { [`platformsSeen.${platform}`]: new Date() } },
      );
    }

    const claimed = !!user.crossGiftBonus;
    const otherPlatformSeen = !!user.platformsSeen?.[otherPlatform(platform)];

    const status: CrossGiftStatus = {
      platform,
      claimed,
      otherPlatformSeen,
      firstSeen,
      claimable: !claimed && otherPlatformSeen && !hasMoveToWebQuest(user),
      flies: CROSS_GIFT_FLIES,
    };
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
