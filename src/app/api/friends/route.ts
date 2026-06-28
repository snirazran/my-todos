export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FriendSummary } from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import type { DailyFlyProgress } from '@/lib/types/UserDoc';

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
        .select('name frogName wardrobe.equipped wardrobe.flyDaily')
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);

    const toSummary = (u: {
      _id: string;
      name?: string;
      frogName?: string;
      wardrobe?: { equipped?: Partial<Record<string, string | null>>; flyDaily?: DailyFlyProgress };
    }): FriendSummary => ({
      userId: u._id,
      name: u.name ?? '',
      frogName: u.frogName ?? 'Frog',
      indices: equippedToIndices(u.wardrobe?.equipped, byId),
      fliesToday: fliesEarnedOn(u.wardrobe?.flyDaily, today),
    });

    const friends: FriendSummary[] = users.map(toSummary);

    return NextResponse.json({
      friends,
      me: me ? toSummary(me) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load friends' },
      { status: 500 },
    );
  }
}
