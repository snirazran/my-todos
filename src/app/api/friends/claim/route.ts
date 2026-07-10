export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { contributionFrom } from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import type { DailyFlyProgress, FriendFlyDaily } from '@/lib/types/UserDoc';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

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
      .select('wardrobe.flies wardrobe.friendFlyDaily premiumUntil')
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
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: { source: 'friend_reward_double', fly_amount: bonus, is_premium: false },
      });
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
    const incTotals: Record<string, number> = {};
    for (const f of friends) {
      const owed = contributionFrom(fliesEarnedOn(f.wardrobe?.flyDaily, today));
      const already = credited[f._id] ?? 0;
      if (owed > already) {
        const delta = owed - already;
        granted += delta;
        credited[f._id] = owed;
        incTotals[`wardrobe.friendFlyTotals.${f._id}`] = delta;
      }
    }

    if (granted <= 0) {
      return NextResponse.json({ granted: 0 });
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: { 'wardrobe.flies': granted, ...incTotals },
        $set: {
          'wardrobe.friendFlyDaily': {
            date: today,
            credited,
            lastClaim: { amount: granted, doubled: false },
          },
        },
      },
    );
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'friend_activity',
        fly_amount: granted,
        is_premium: !!me?.premiumUntil && new Date(me.premiumUntil) > new Date(),
      },
    });

    return NextResponse.json({ granted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
