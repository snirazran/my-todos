export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FriendSummary } from '@/lib/friends/indices';

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const edges = await FriendshipModel.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();

    const friendIds = edges.map((e) => (e.userA === userId ? e.userB : e.userA));
    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const [users, catalog] = await Promise.all([
      UserModel.find({ _id: { $in: friendIds } })
        .select('name frogName wardrobe.equipped')
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);

    const friends: FriendSummary[] = users.map((u) => ({
      userId: u._id,
      name: u.name ?? '',
      frogName: u.frogName ?? 'Frog',
      indices: equippedToIndices(u.wardrobe?.equipped, byId),
    }));

    return NextResponse.json({ friends });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load friends' },
      { status: 500 },
    );
  }
}
