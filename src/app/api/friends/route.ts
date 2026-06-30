export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import {
  equippedToIndices,
  contributionFrom,
  type FriendSummary,
} from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
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
        .select('name frogName wardrobe.equipped wardrobe.flyDaily')
        .lean(),
      UserModel.findById(userId)
        .select('name frogName wardrobe.equipped wardrobe.flyDaily wardrobe.friendFlyDaily')
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);

    const toSummary = (u: {
      _id: string;
      name?: string;
      frogName?: string;
      wardrobe?: { equipped?: Partial<Record<string, string | null>>; flyDaily?: DailyFlyProgress };
    }): FriendSummary => {
      const fliesToday = fliesEarnedOn(u.wardrobe?.flyDaily, today);
      return {
        userId: u._id,
        name: u.name ?? '',
        frogName: u.frogName ?? 'Frog',
        indices: equippedToIndices(u.wardrobe?.equipped, byId),
        fliesToday,
        givesYou: contributionFrom(fliesToday),
      };
    };

    const friends: FriendSummary[] = users.map(toSummary);

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
