export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import LookReactionModel from '@/lib/models/LookReaction';
import {
  LOOK_REACTIONS,
  lookKeyOf,
  type LookReactionKind,
} from '@/lib/friends/lookReactions';
import { areFriends } from '@/lib/friends/code';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, equippedToItems } from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const isKind = (v: unknown): v is LookReactionKind =>
  typeof v === 'string' && (LOOK_REACTIONS as readonly string[]).includes(v);

/** Reactions this user has received, newest first, plus the unseen count. */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    const today = getZonedToday(tz);

    const [received, sentToday, me] = await Promise.all([
      LookReactionModel.find({ toUserId: userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      LookReactionModel.find({ fromUserId: userId, dayKey: today })
        .select('toUserId kind')
        .lean(),
      UserModel.findById(userId).select('wardrobe.equipped').lean(),
    ]);

    const currentKey = lookKeyOf(me?.wardrobe?.equipped ?? {});

    const senderIds = Array.from(new Set(received.map((r) => r.fromUserId)));
    const senders = await UserModel.find({ _id: { $in: senderIds } })
      .select('name frogName')
      .lean();
    const nameById = new Map(
      senders.map((u) => [String(u._id), u.name || u.frogName || 'A friend']),
    );

    return json({
      reactions: received.map((r) => ({
        id: String(r._id),
        fromUserId: r.fromUserId,
        fromName: nameById.get(r.fromUserId) ?? 'A friend',
        kind: r.kind,
        look: r.lookIndices
          ? {
              key: r.lookKey ?? '',
              indices: r.lookIndices,
              items: r.lookItems ?? [],
            }
          : null,
        isCurrentLook: !!r.lookKey && r.lookKey === currentKey,
        seen: !!r.seen,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : new Date(r.createdAt).toISOString(),
      })),
      unseenCount: received.filter((r) => !r.seen).length,
      sentToday: Object.fromEntries(
        sentToday.map((r) => [r.toUserId, r.kind]),
      ) as Record<string, LookReactionKind>,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** React to a friend's whole look. One per friend per day, changeable. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { toUserId?: unknown; kind?: unknown; tz?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const toUserId = typeof body.toUserId === 'string' ? body.toUserId : '';
    const kind: LookReactionKind = isKind(body.kind) ? body.kind : 'fire';
    const tz = typeof body.tz === 'string' ? body.tz : 'UTC';
    if (!toUserId) return json({ error: 'Missing toUserId' }, 400);
    if (toUserId === userId)
      return json({ error: 'Cannot react to your own look' }, 400);

    await connectMongo();
    if (!(await areFriends(userId, toUserId)))
      return json({ error: 'Not friends' }, 403);

    const [target, catalog] = await Promise.all([
      UserModel.findById(toUserId).select('wardrobe.equipped').lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);
    const equipped = target?.wardrobe?.equipped ?? {};
    const lookItems = equippedToItems(equipped, byId).map((i) => ({
      id: i.id,
      name: i.name,
      rarity: i.rarity,
    }));

    const dayKey = getZonedToday(tz);
    await LookReactionModel.updateOne(
      { fromUserId: userId, toUserId, dayKey },
      {
        $set: {
          kind,
          lookKey: lookKeyOf(equipped),
          lookIndices: equippedToIndices(equipped, byId),
          lookItems,
          createdAt: new Date(),
        },
        $setOnInsert: { seen: false },
      },
      { upsert: true },
    );

    void notifyFriendUpdate(toUserId);
    await recordAnalyticsEvent({
      userId,
      name: 'look_reaction_sent',
      properties: { kind, item_count: lookItems.length },
    });

    return json({ ok: true, kind });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** Mark every received reaction as seen. */
export async function PATCH() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await LookReactionModel.updateMany(
      { toUserId: userId, seen: false },
      { $set: { seen: true } },
    );
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
