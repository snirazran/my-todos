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
import { friendsPondCap, loadFlyEconomyConfig } from '@/lib/economy/config';
import { fliesGrantedOnDay, settleFlyGrant } from '@/lib/economy/ledger';
import { resolveEconomyTimezone } from '@/lib/economy/guards';

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
  const double = !!body.double;

  try {
    await connectMongo();
    const config = await loadFlyEconomyConfig();
    const tz = await resolveEconomyTimezone(userId, body.tz);
    const today = getZonedToday(tz);

    const me = await UserModel.findById(userId)
      .select('wardrobe.flies wardrobe.friendFlyDaily premiumUntil')
      .lean();
    const prior = me?.wardrobe?.friendFlyDaily as FriendFlyDaily | undefined;
    const premium = !!me?.premiumUntil && new Date(me.premiumUntil) > new Date();
    const pondCap = friendsPondCap(config, premium);
    const [claimedToday, pondRowToday] = await Promise.all([
      fliesGrantedOnDay(userId, today, ['friend_pond', 'friend_pond_double']),
      fliesGrantedOnDay(userId, today, ['friend_pond']),
    ]);
    const pondRemaining = Math.max(0, pondCap - claimedToday);

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
      const settlement = await settleFlyGrant({
        userId,
        source: 'friend_pond_double',
        occurrenceKey: today,
        dayKey: today,
        targetAmount: lastClaim.amount,
        capRemaining: pondRemaining,
        meta: { doubled: true },
      });
      if (settlement.delta <= 0) {
        return NextResponse.json({ granted: 0, capped: true });
      }
      await UserModel.updateOne(
        { _id: userId },
        {
          $inc: { 'wardrobe.flies': settlement.delta },
          $set: { 'wardrobe.friendFlyDaily.lastClaim.doubled': true },
        },
      );
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'friend_reward_double',
          fly_amount: settlement.delta,
          is_premium: premium,
        },
      });
      return NextResponse.json({ granted: settlement.delta });
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

    // Each friend can only send so much a day, and the pond as a whole only so
    // much — an account farming a wide friend graph runs into both.
    let granted = 0;
    let headroom = pondRemaining;
    const incTotals: Record<string, number> = {};
    for (const f of friends) {
      if (headroom <= 0) break;
      const owed = Math.min(
        config.friendsPond.perFriendDailyCap,
        contributionFrom(fliesEarnedOn(f.wardrobe?.flyDaily, today)),
      );
      const already = credited[f._id] ?? 0;
      if (owed <= already) continue;
      const delta = Math.min(owed - already, headroom);
      if (delta <= 0) continue;
      granted += delta;
      headroom -= delta;
      credited[f._id] = already + delta;
      incTotals[`wardrobe.friendFlyTotals.${f._id}`] = delta;
    }

    if (granted <= 0) {
      return NextResponse.json({ granted: 0 });
    }

    const settlement = await settleFlyGrant({
      userId,
      source: 'friend_pond',
      occurrenceKey: today,
      dayKey: today,
      targetAmount: pondRowToday + granted,
      capRemaining: pondRemaining,
      meta: { friends: Object.keys(incTotals).length },
    });

    if (settlement.delta <= 0) {
      return NextResponse.json({ granted: 0, capped: true });
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: { 'wardrobe.flies': settlement.delta, ...incTotals },
        $set: {
          'wardrobe.friendFlyDaily': {
            date: today,
            credited,
            lastClaim: { amount: settlement.delta, doubled: false },
          },
        },
      },
    );
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'friend_activity',
        fly_amount: settlement.delta,
        is_premium: premium,
      },
    });

    return NextResponse.json({ granted: settlement.delta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
