export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { contributionFrom } from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import type { DailyFlyProgress, FriendFlyDaily } from '@/lib/types/UserDoc';

function fliesEarnedOn(
  flyDaily: DailyFlyProgress | undefined,
  today: string,
): number {
  if (!flyDaily || flyDaily.date !== today) return 0;
  return flyDaily.earned ?? 0;
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tz?: string; double?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const tz = body.tz || 'UTC';
  const double = !!body.double;
  const today = getZonedToday(tz);

  try {
    await connectMongo();

    const me = await UserModel.findById(userId)
      .select('wardrobe.flies wardrobe.friendFlyDaily')
      .lean();
    const prior = me?.wardrobe?.friendFlyDaily as FriendFlyDaily | undefined;

    if (double) {
      const lastClaim = prior?.lastClaim;
      if (
        !prior ||
        prior.date !== today ||
        !lastClaim ||
        lastClaim.doubled ||
        lastClaim.amount <= 0
      ) {
        return NextResponse.json({ granted: 0 });
      }
      const bonus = lastClaim.amount;
      await UserModel.updateOne(
        { _id: userId },
        {
          $inc: { 'wardrobe.flies': bonus },
          $set: { 'wardrobe.friendFlyDaily.lastClaim.doubled': true },
        },
      );
      return NextResponse.json({ granted: bonus });
    }

    const edges = await FriendshipModel.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();
    const friendIds = edges.map((e) => (e.userA === userId ? e.userB : e.userA));

    const friends = await UserModel.find({ _id: { $in: friendIds } })
      .select('wardrobe.flyDaily')
      .lean();

    const credited: Record<string, number> =
      prior && prior.date === today ? { ...prior.credited } : {};

    let granted = 0;
    for (const f of friends) {
      const owed = contributionFrom(fliesEarnedOn(f.wardrobe?.flyDaily, today));
      const already = credited[f._id] ?? 0;
      if (owed > already) {
        granted += owed - already;
        credited[f._id] = owed;
      }
    }

    if (granted <= 0) {
      return NextResponse.json({ granted: 0 });
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: { 'wardrobe.flies': granted },
        $set: {
          'wardrobe.friendFlyDaily': {
            date: today,
            credited,
            lastClaim: { amount: granted, doubled: false },
          },
        },
      },
    );

    return NextResponse.json({ granted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
