export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import UserModel from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { friendshipKey } from '@/lib/friends/code';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import type { Rarity } from '@/lib/skins/catalog';
import {
  equippedToIndices,
  equippedToItems,
  highestRarity,
  contributionFrom,
  type FriendSummary,
} from '@/lib/friends/indices';
import {
  pondDailyCap,
  pondFliesFrom,
  pondGate,
  pondOwed,
  rollPond,
  type PondState,
} from '@/lib/friends/pond';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { fliesGrantedOnDay } from '@/lib/economy/ledger';
import { resolveEconomyTimezone } from '@/lib/economy/guards';
import { getZonedToday } from '@/lib/utils';
import { previousDayKey } from '@/lib/quests/streak';
import { computeGap, readLoginStreakState } from '@/lib/streak/loginStreak';
import { readShieldState } from '@/lib/shields/engine';
import type { DailyFlyProgress, FriendFlyDaily } from '@/lib/types/UserDoc';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

function fliesEarnedOn(
  flyDaily: DailyFlyProgress | undefined,
  today: string,
): number {
  if (!flyDaily || flyDaily.date !== today) return 0;
  return flyDaily.earned ?? 0;
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const economyConfig = await loadFlyEconomyConfig();
    const tz = await resolveEconomyTimezone(
      userId,
      req.nextUrl.searchParams.get('tz'),
    );
    const today = getZonedToday(tz);

    const edges = await FriendshipModel.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();

    const friendIds = edges.map((e) => (e.userA === userId ? e.userB : e.userA));

    const [users, me, catalog] = await Promise.all([
      UserModel.find({ _id: { $in: friendIds } })
        .select(
          'name frogName premiumUntil quests.loginStreak wardrobe.equipped wardrobe.flyDaily wardrobe.backgrounds.equipped statistics.daily activeFrogodoroTimer.status activeFrogodoroTimer.phase activeFrogodoroTimer.endsAt',
        )
        .lean(),
      UserModel.findById(userId)
        .select(
          'name frogName premiumUntil quests.loginStreak wardrobe.equipped wardrobe.flyDaily wardrobe.friendFlyDaily wardrobe.friendFlyTotals wardrobe.backgrounds.equipped statistics.daily',
        )
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);

    const backgroundIds = Array.from(
      new Set(
        [...users, me]
          .map((u) => u?.wardrobe?.backgrounds?.equipped)
          .filter((id): id is string => !!id),
      ),
    );
    const backgroundDocs = backgroundIds.length
      ? await BackgroundModel.find({ id: { $in: backgroundIds } })
          .select('id rarity')
          .lean()
      : [];
    const backgroundRarityById = new Map<string, Rarity>(
      backgroundDocs.map((b) => [b.id, b.rarity as Rarity]),
    );

    const aliveStreakOf = (u: unknown): number => {
      const state = readLoginStreakState(u);
      if (state.count <= 0 || !state.lastDayKey) return 0;
      if (
        state.lastDayKey === today ||
        state.lastDayKey === previousDayKey(today)
      ) {
        return state.count;
      }
      // A held Lily Pad only ever covers one day, so anything longer is dead.
      return computeGap(state.lastDayKey, today) === 1 &&
        readShieldState(u).count > 0
        ? state.count
        : 0;
    };

    const toSummary = (u: {
      _id: string;
      name?: string;
      frogName?: string;
      premiumUntil?: Date | string | null;
      statistics?: { daily?: { date?: string; dailyTasksCount?: number } };
      wardrobe?: {
        equipped?: Partial<Record<string, string | null>>;
        flyDaily?: DailyFlyProgress;
        backgrounds?: { equipped?: string | null };
      };
      activeFrogodoroTimer?: {
        status?: string;
        phase?: string;
        endsAt?: string | null;
      } | null;
    }): FriendSummary => {
      const fliesToday = fliesEarnedOn(u.wardrobe?.flyDaily, today);
      const tasksToday =
        u.statistics?.daily?.date === today
          ? u.statistics.daily.dailyTasksCount ?? 0
          : 0;
      const equippedItems = equippedToItems(u.wardrobe?.equipped, byId);
      const backgroundId = u.wardrobe?.backgrounds?.equipped ?? null;
      const backgroundRarity = backgroundId
        ? backgroundRarityById.get(backgroundId) ?? null
        : null;
      const timer = u.activeFrogodoroTimer;
      const focusing =
        timer?.status === 'running' &&
        timer.phase === 'focus' &&
        !!timer.endsAt &&
        new Date(timer.endsAt).getTime() > Date.now();
      return {
        focusing,
        userId: u._id,
        name: u.name ?? '',
        frogName: u.frogName ?? 'Frog',
        indices: equippedToIndices(u.wardrobe?.equipped, byId),
        equippedItems,
        flexRarity: highestRarity(equippedItems, backgroundRarity),
        backgroundRarity,
        fliesToday,
        tasksToday,
        givesYou: pondFliesFrom(tasksToday, economyConfig),
        backgroundId,
        streak: aliveStreakOf(u),
        premium: u.premiumUntil ? new Date(u.premiumUntil) > new Date() : false,
      };
    };

    const totals = (me?.wardrobe?.friendFlyTotals ?? {}) as Record<
      string,
      number
    >;
    const friends: FriendSummary[] = users.map((u) => ({
      ...toSummary(u),
      sharedTotal: Math.max(0, Math.floor(totals[u._id] ?? 0)),
    }));

    const prior = me?.wardrobe?.friendFlyDaily as PondState | undefined;
    const generatedToday: Record<string, number> = {};
    for (const f of friends) {
      if ((f.givesYou ?? 0) > 0) generatedToday[f.userId] = f.givesYou ?? 0;
    }

    // Rolling here (not only on claim) is what keeps the 48h window honest for
    // someone who opens the tab but doesn't claim.
    const state = rollPond(prior, today, generatedToday, economyConfig);
    if (!prior || prior.date !== today) {
      await UserModel.updateOne(
        { _id: userId },
        { $set: { 'wardrobe.friendFlyDaily': state } },
      );
    }

    const ownTasksToday =
      me?.statistics?.daily?.date === today
        ? me.statistics.daily.dailyTasksCount ?? 0
        : 0;
    const gate = pondGate(ownTasksToday, economyConfig);
    const premium =
      !!me?.premiumUntil && new Date(me.premiumUntil) > new Date();
    const cap = pondDailyCap(economyConfig, premium);
    const claimedToday = await fliesGrantedOnDay(userId, today, [
      'friend_pond',
      'friend_pond_double',
    ]);

    const owed = pondOwed(state, generatedToday);
    const claimable = Math.min(
      Math.max(0, cap - claimedToday),
      owed.reduce((sum, entry) => sum + entry.amount, 0),
    );

    const receivedToday = friends.reduce((sum, f) => sum + (f.givesYou ?? 0), 0);

    return NextResponse.json({
      friends,
      me: me ? toSummary(me) : null,
      claimable,
      gate,
      pond: {
        cap,
        claimedToday,
        perFriendCap: economyConfig.friendsPond.perFriendDailyCap,
        tasksPerGeneration: economyConfig.friendsPond.tasksPerGeneration,
        fliesPerGeneration: economyConfig.friendsPond.fliesPerGeneration,
        expiryHours: economyConfig.friendsPond.expiryHours,
        carried: owed.reduce((sum, entry) => sum + entry.carried, 0),
        weekDays: state.weekDays?.length ?? 0,
        weekFriends: state.weekFriends?.length ?? 0,
        weeklyBonusDays: economyConfig.friendsPond.weeklyBonusDays,
        weeklyBonusFriends: economyConfig.friendsPond.weeklyBonusFriends,
        weeklyBonusGiven: !!state.weekBonusGiven,
      },
      contribution: { receivedToday },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load friends' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { friendId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const friendId = (body.friendId || '').trim();
  if (!friendId) {
    return NextResponse.json({ error: 'Missing friendId' }, { status: 400 });
  }

  try {
    await connectMongo();
    const [userA, userB] = friendshipKey(userId, friendId);
    await FriendshipModel.deleteOne({ userA, userB });
    // Clear any request history between them so they can re-add later.
    await FriendRequestModel.deleteMany({
      $or: [
        { fromUserId: userId, toUserId: friendId },
        { fromUserId: friendId, toUserId: userId },
      ],
    });

    // Wipe each user's stored data about the other (both directions).
    await Promise.all([
      UserModel.updateOne(
        { _id: userId },
        {
          $unset: {
            [`wardrobe.friendFlyTotals.${friendId}`]: '',
            [`wardrobe.friendFlyDaily.credited.${friendId}`]: '',
          },
        },
      ),
      UserModel.updateOne(
        { _id: friendId },
        {
          $unset: {
            [`wardrobe.friendFlyTotals.${userId}`]: '',
            [`wardrobe.friendFlyDaily.credited.${userId}`]: '',
          },
        },
      ),
    ]);

    void notifyFriendUpdate(friendId);

    await recordAnalyticsEvent({ userId, name: 'friend_removed' });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove friend' },
      { status: 500 },
    );
  }
}
