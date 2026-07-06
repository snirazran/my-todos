export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import UserModel from '@/lib/models/User';
import { friendshipKey } from '@/lib/friends/code';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import {
  equippedToIndices,
  equippedToItems,
  highestRarity,
  contributionFrom,
  type FriendSummary,
} from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import { previousDayKey } from '@/lib/quests/streak';
import { computeGap, readLoginStreakState } from '@/lib/streak/loginStreak';
import type { DailyFlyProgress, FriendFlyDaily } from '@/lib/types/UserDoc';

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

  const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
  const today = getZonedToday(tz);

  try {
    await connectMongo();

    const edges = await FriendshipModel.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();

    const friendIds = edges.map((e) => (e.userA === userId ? e.userB : e.userA));

    const [users, me, catalog] = await Promise.all([
      UserModel.find({ _id: { $in: friendIds } })
        .select(
          'name frogName premiumUntil quests.loginStreak wardrobe.equipped wardrobe.flyDaily wardrobe.backgrounds.equipped',
        )
        .lean(),
      UserModel.findById(userId)
        .select(
          'name frogName premiumUntil quests.loginStreak wardrobe.equipped wardrobe.flyDaily wardrobe.friendFlyDaily wardrobe.friendFlyTotals wardrobe.backgrounds.equipped',
        )
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);

    const aliveStreakOf = (u: unknown): number => {
      const state = readLoginStreakState(u);
      if (state.count <= 0 || !state.lastDayKey) return 0;
      if (
        state.lastDayKey === today ||
        state.lastDayKey === previousDayKey(today)
      ) {
        return state.count;
      }
      return computeGap(state.lastDayKey, today) <= state.freezes
        ? state.count
        : 0;
    };

    const toSummary = (u: {
      _id: string;
      name?: string;
      frogName?: string;
      premiumUntil?: Date | string | null;
      wardrobe?: {
        equipped?: Partial<Record<string, string | null>>;
        flyDaily?: DailyFlyProgress;
        backgrounds?: { equipped?: string | null };
      };
    }): FriendSummary => {
      const fliesToday = fliesEarnedOn(u.wardrobe?.flyDaily, today);
      const equippedItems = equippedToItems(u.wardrobe?.equipped, byId);
      return {
        userId: u._id,
        name: u.name ?? '',
        frogName: u.frogName ?? 'Frog',
        indices: equippedToIndices(u.wardrobe?.equipped, byId),
        equippedItems,
        flexRarity: highestRarity(equippedItems),
        fliesToday,
        givesYou: contributionFrom(fliesToday),
        backgroundId: u.wardrobe?.backgrounds?.equipped ?? null,
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

    const prior = me?.wardrobe?.friendFlyDaily as FriendFlyDaily | undefined;
    const credited: Record<string, number> =
      prior && prior.date === today ? { ...prior.credited } : {};

    let claimable = 0;
    for (const f of friends) {
      const owed = f.givesYou ?? 0;
      const already = credited[f.userId] ?? 0;
      if (owed > already) claimable += owed - already;
    }

    const receivedToday = friends.reduce((sum, f) => sum + (f.givesYou ?? 0), 0);

    return NextResponse.json({
      friends,
      me: me ? toSummary(me) : null,
      claimable,
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove friend' },
      { status: 500 },
    );
  }
}
