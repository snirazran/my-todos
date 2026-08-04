export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import ReferralModel from '@/lib/models/Referral';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FrogIndices } from '@/lib/friends/indices';

const MAX_SUGGESTIONS = 5;
/** How long a dismissed suggestion stays out of the pool. */
const SNOOZE_DAYS = 45;

export type SuggestionReason = 'mutual' | 'inviter' | 'invitee' | 'sibling';

export type FriendSuggestion = {
  userId: string;
  name: string;
  frogName: string;
  indices: FrogIndices;
  premium: boolean;
  reason: SuggestionReason;
  mutualCount: number;
  mutualNames: string[];
  /** Whose invite links you two together, for the non-mutual reasons. */
  viaName?: string;
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

    const [friendEdges, pendingRequests, me] = await Promise.all([
      friendIds.length > 0
        ? FriendshipModel.find({
            $or: [{ userA: { $in: friendIds } }, { userB: { $in: friendIds } }],
          }).lean()
        : Promise.resolve([]),
      FriendRequestModel.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'pending',
      })
        .select('fromUserId toUserId')
        .lean(),
      UserModel.findById(userId)
        .select('suggestionsDismissed suggestionSnoozes')
        .lean(),
    ]);

    const now = new Date();
    const excluded = new Set<string>([userId, ...friendIds]);
    for (const r of pendingRequests) {
      excluded.add(r.fromUserId);
      excluded.add(r.toUserId);
    }
    for (const id of me?.suggestionsDismissed ?? []) excluded.add(id);
    for (const snooze of me?.suggestionSnoozes ?? []) {
      if (new Date(snooze.until) > now) excluded.add(snooze.userId);
    }

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

    type Picked = {
      userId: string;
      reason: SuggestionReason;
      mutuals: Set<string>;
      viaId?: string;
    };
    const picked: Picked[] = Array.from(mutualsByCandidate.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, MAX_SUGGESTIONS)
      .map(([id, mutuals]) => ({ userId: id, reason: 'mutual', mutuals }));

    // Nobody reaches the mutual-friend pool on day one, which is exactly when
    // the graph needs to grow — so top up from the invite chain: whoever
    // invited you, whoever you invited, and everyone else who joined from the
    // same invite.
    if (picked.length < MAX_SUGGESTIONS) {
      const pickedIds = new Set(picked.map((p) => p.userId));
      const takeable = (id: string | null | undefined): id is string =>
        !!id && !excluded.has(id) && !pickedIds.has(id);

      const [claimedByMe, invitedByMe] = await Promise.all([
        ReferralModel.findOne({ claimedByUserId: userId })
          .select('inviterId')
          .lean(),
        ReferralModel.find({
          inviterId: userId,
          claimedByUserId: { $ne: null },
        })
          .select('claimedByUserId')
          .limit(MAX_SUGGESTIONS * 2)
          .lean(),
      ]);
      const inviterId = claimedByMe?.inviterId ?? null;

      const add = (id: string, reason: SuggestionReason, viaId?: string) => {
        if (picked.length >= MAX_SUGGESTIONS || !takeable(id)) return;
        pickedIds.add(id);
        picked.push({ userId: id, reason, mutuals: new Set(), viaId });
      };

      if (inviterId) add(inviterId, 'inviter');
      for (const ref of invitedByMe) add(ref.claimedByUserId!, 'invitee');

      if (inviterId && picked.length < MAX_SUGGESTIONS) {
        const siblings = await ReferralModel.find({
          inviterId,
          claimedByUserId: { $nin: [null, userId] },
        })
          .select('claimedByUserId')
          .limit(MAX_SUGGESTIONS * 3)
          .lean();
        for (const ref of siblings)
          add(ref.claimedByUserId!, 'sibling', inviterId);
      }
    }

    if (picked.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const lookupIds = new Set<string>();
    for (const p of picked) {
      p.mutuals.forEach((id) => lookupIds.add(id));
      if (p.viaId) lookupIds.add(p.viaId);
    }

    const [candidates, contextUsers, catalog] = await Promise.all([
      UserModel.find({ _id: { $in: picked.map((p) => p.userId) } })
        .select('name frogName premiumUntil wardrobe.equipped')
        .lean(),
      lookupIds.size > 0
        ? UserModel.find({ _id: { $in: Array.from(lookupIds) } })
            .select('name frogName')
            .lean()
        : Promise.resolve([]),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);
    const candidateById = new Map(candidates.map((c) => [c._id, c]));
    const contextNameById = new Map(
      contextUsers.map((u) => [u._id, u.name || u.frogName || 'Frog']),
    );

    const suggestions: FriendSuggestion[] = [];
    for (const entry of picked) {
      const user = candidateById.get(entry.userId);
      if (!user) continue;
      suggestions.push({
        userId: entry.userId,
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
        reason: entry.reason,
        mutualCount: entry.mutuals.size,
        mutualNames: Array.from(entry.mutuals)
          .map((id) => contextNameById.get(id))
          .filter((n): n is string => !!n)
          .slice(0, 2),
        viaName: entry.viaId ? contextNameById.get(entry.viaId) : undefined,
      });
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[friends/suggestions] failed', err);
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
    const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    await UserModel.updateOne(
      { _id: userId },
      { $pull: { suggestionSnoozes: { userId: body.dismissUserId } } },
    );
    await UserModel.updateOne(
      { _id: userId },
      { $push: { suggestionSnoozes: { userId: body.dismissUserId, until } } },
    );
    return NextResponse.json({ ok: true, until });
  } catch (err) {
    console.error('[friends/suggestions] dismiss failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to dismiss' },
      { status: 500 },
    );
  }
}
