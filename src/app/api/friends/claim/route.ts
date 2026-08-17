export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { fliesGrantedOnDay, settleFlyGrant } from '@/lib/economy/ledger';
import { economyWeekKey, resolveEconomyTimezone } from '@/lib/economy/guards';
import {
  pondDailyCap,
  pondFliesFrom,
  pondGate,
  pondOwed,
  rollPond,
  type PondState,
} from '@/lib/friends/pond';

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
      .select(
        'wardrobe.flies wardrobe.friendFlyDaily premiumUntil statistics.daily',
      )
      .lean();
    const premium = !!me?.premiumUntil && new Date(me.premiumUntil) > new Date();
    const prior = me?.wardrobe?.friendFlyDaily as PondState | undefined;

    const ownTasksToday =
      me?.statistics?.daily?.date === today
        ? me.statistics.daily.dailyTasksCount ?? 0
        : 0;
    const gate = pondGate(ownTasksToday, config);
    if (!gate.open) {
      return NextResponse.json({ granted: 0, gate });
    }

    const cap = pondDailyCap(config, premium);
    const [claimedToday, pondRowToday] = await Promise.all([
      fliesGrantedOnDay(userId, today, ['friend_pond', 'friend_pond_double']),
      fliesGrantedOnDay(userId, today, ['friend_pond']),
    ]);
    const pondRemaining = Math.max(0, cap - claimedToday);

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
      .select('statistics.daily')
      .lean();

    const generatedToday: Record<string, number> = {};
    for (const friend of friends) {
      const tasks =
        friend.statistics?.daily?.date === today
          ? friend.statistics.daily.dailyTasksCount ?? 0
          : 0;
      const generated = pondFliesFrom(tasks, config);
      if (generated > 0) generatedToday[friend._id] = generated;
    }

    const state = rollPond(prior, today, generatedToday, config);
    const owed = pondOwed(state, generatedToday);

    // Each friend can only send so much a day, the day before is still
    // claimable until it expires, and the pond as a whole has its own ceiling.
    let granted = 0;
    let headroom = pondRemaining;
    const credited = { ...(state.credited ?? {}) };
    const prevCredited = { ...(state.prevCredited ?? {}) };
    const incTotals: Record<string, number> = {};
    const claimedFrom: string[] = [];

    for (const entry of owed) {
      if (headroom <= 0) break;
      if (entry.amount <= 0) continue;
      const take = Math.min(entry.amount, headroom);
      const fromCarried = Math.min(entry.carried, take);
      const fromToday = take - fromCarried;
      if (fromCarried > 0) {
        prevCredited[entry.friendId] =
          (prevCredited[entry.friendId] ?? 0) + fromCarried;
      }
      if (fromToday > 0) {
        credited[entry.friendId] = (credited[entry.friendId] ?? 0) + fromToday;
      }
      granted += take;
      headroom -= take;
      incTotals[`wardrobe.friendFlyTotals.${entry.friendId}`] = take;
      claimedFrom.push(entry.friendId);
    }

    if (granted <= 0) {
      return NextResponse.json({ granted: 0, gate });
    }

    const settlement = await settleFlyGrant({
      userId,
      source: 'friend_pond',
      occurrenceKey: today,
      dayKey: today,
      targetAmount: pondRowToday + granted,
      capRemaining: pondRemaining,
      meta: { friends: claimedFrom.length },
    });

    if (settlement.delta <= 0) {
      return NextResponse.json({ granted: 0, capped: true, gate });
    }

    // The weekly social bonus rewards a real friend list over one alt account:
    // several different friends, on several different days.
    const weekKey = economyWeekKey(today);
    const sameWeek = state.weekKey === weekKey;
    const weekDays = Array.from(
      new Set([...(sameWeek ? state.weekDays ?? [] : []), today]),
    );
    const weekFriends = Array.from(
      new Set([...(sameWeek ? state.weekFriends ?? [] : []), ...claimedFrom]),
    );
    const bonusAlreadyGiven = sameWeek ? !!state.weekBonusGiven : false;
    const earnsWeeklyBonus =
      !bonusAlreadyGiven &&
      config.friendsPond.weeklyBonusDays > 0 &&
      weekDays.length >= config.friendsPond.weeklyBonusDays &&
      weekFriends.length >= config.friendsPond.weeklyBonusFriends;

    const nextState: PondState = {
      ...state,
      date: today,
      credited,
      prevCredited,
      lastClaim: { amount: settlement.delta, doubled: false },
      weekKey,
      weekDays,
      weekFriends,
      weekBonusGiven: bonusAlreadyGiven || earnsWeeklyBonus,
    };

    const update: Record<string, any> = {
      $inc: { 'wardrobe.flies': settlement.delta, ...incTotals },
      $set: { 'wardrobe.friendFlyDaily': nextState },
    };
    const bonusGiftId = config.friendsPond.weeklyBonusGiftItemId;
    if (earnsWeeklyBonus && bonusGiftId) {
      update.$inc[`wardrobe.inventory.${bonusGiftId}`] = 1;
      update.$addToSet = { 'wardrobe.unseenItems': bonusGiftId };
    }
    await UserModel.updateOne({ _id: userId }, update);

    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'friend_activity',
        fly_amount: settlement.delta,
        is_premium: premium,
      },
    });

    return NextResponse.json({
      granted: settlement.delta,
      gate,
      weeklyBonus: earnsWeeklyBonus
        ? { giftItemId: bonusGiftId, friends: weekFriends.length, days: weekDays.length }
        : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
