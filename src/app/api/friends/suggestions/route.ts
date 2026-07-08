export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FrogIndices } from '@/lib/friends/indices';

const MAX_SUGGESTIONS = 5;

export type FriendSuggestion = {
  userId: string;
  name: string;
  frogName: string;
  indices: FrogIndices;
  premium: boolean;
  mutualCount: number;
  mutualNames: string[];
};

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const myEdges = await FriendshipModel.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();
    const friendIds = myEdges.map((e) =>
      e.userA === userId ? e.userB : e.userA,
    );
    if (friendIds.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const [friendEdges, pendingRequests, me] = await Promise.all([
      FriendshipModel.find({
        $or: [{ userA: { $in: friendIds } }, { userB: { $in: friendIds } }],
      }).lean(),
      FriendRequestModel.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'pending',
      })
        .select('fromUserId toUserId')
        .lean(),
      UserModel.findById(userId).select('suggestionsDismissed').lean(),
    ]);

    const excluded = new Set<string>([userId, ...friendIds]);
    for (const r of pendingRequests) {
      excluded.add(r.fromUserId);
      excluded.add(r.toUserId);
    }
    for (const id of me?.suggestionsDismissed ?? []) excluded.add(id);

    const friendIdSet = new Set(friendIds);
    const mutualsByCandidate = new Map<string, Set<string>>();
    for (const edge of friendEdges) {
      const pairs: [string, string][] = [
        [edge.userA, edge.userB],
        [edge.userB, edge.userA],
      ];
      for (const [friend, candidate] of pairs) {
        if (!friendIdSet.has(friend)) continue;
        if (excluded.has(candidate)) continue;
        const set = mutualsByCandidate.get(candidate) ?? new Set<string>();
        set.add(friend);
        mutualsByCandidate.set(candidate, set);
      }
    }

    const ranked = Array.from(mutualsByCandidate.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, MAX_SUGGESTIONS);
    if (ranked.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const candidateIds = ranked.map(([id]) => id);
    const mutualFriendIds = new Set<string>();
    for (const [, mutuals] of ranked)
      mutuals.forEach((id) => mutualFriendIds.add(id));

    const [candidates, mutualUsers, catalog] = await Promise.all([
      UserModel.find({ _id: { $in: candidateIds } })
        .select('name frogName premiumUntil wardrobe.equipped')
        .lean(),
      UserModel.find({ _id: { $in: Array.from(mutualFriendIds) } })
        .select('name frogName')
        .lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);
    const candidateById = new Map(candidates.map((c) => [c._id, c]));
    const mutualNameById = new Map(
      mutualUsers.map((u) => [u._id, u.name || u.frogName || 'Frog']),
    );

    const suggestions: FriendSuggestion[] = [];
    for (const [candidateId, mutuals] of ranked) {
      const user = candidateById.get(candidateId);
      if (!user) continue;
      suggestions.push({
        userId: candidateId,
        name: user.name ?? '',
        frogName: user.frogName ?? 'Frog',
        indices: equippedToIndices(
          (user.wardrobe as { equipped?: Partial<Record<string, string | null>> } | undefined)
            ?.equipped,
          byId,
        ),
        premium: user.premiumUntil
          ? new Date(user.premiumUntil) > new Date()
          : false,
        mutualCount: mutuals.size,
        mutualNames: Array.from(mutuals)
          .map((id) => mutualNameById.get(id))
          .filter((n): n is string => !!n)
          .slice(0, 2),
      });
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load suggestions' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { dismissUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.dismissUserId) {
    return NextResponse.json({ error: 'Missing dismissUserId' }, { status: 400 });
  }

  try {
    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $addToSet: { suggestionsDismissed: body.dismissUserId } },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to dismiss' },
      { status: 500 },
    );
  }
}
