export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import LookReactionModel from '@/lib/models/LookReaction';
import {
  LOOK_REACTIONS,
  type LookReactionKind,
} from '@/lib/friends/lookReactions';
import { areFriends } from '@/lib/friends/code';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { getZonedToday } from '@/lib/utils';
import { notifyFriendUpdate } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { WardrobeSlot } from '@/lib/skins/catalog';

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

    const [received, sentToday] = await Promise.all([
      LookReactionModel.find({ toUserId: userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      LookReactionModel.find({ fromUserId: userId, dayKey: today })
        .select('toUserId kind')
        .lean(),
    ]);

    const senderIds = Array.from(
      new Set(received.map((r) => r.fromUserId)),
    );
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
        itemId: r.itemId ?? null,
        itemName: r.itemName ?? null,
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

/** React to a friend's current look. Idempotent per friend per day. */
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

    // Snapshot the highest-rarity worn item so the notice can name it later,
    // even after they change outfits.
    const [target, catalog] = await Promise.all([
      UserModel.findById(toUserId).select('wardrobe.equipped').lean(),
      getCachedCatalog(),
    ]);
    const byId = buildById(catalog);
    const equipped = target?.wardrobe?.equipped ?? {};
    let best: { id: string; name: string; rank: number } | null = null;
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    for (const slot of ['skin', 'hat', 'body', 'hand_item'] as WardrobeSlot[]) {
      const id = equipped[slot];
      const def = id ? byId[id] : null;
      if (!def) continue;
      const rank = order.indexOf(def.rarity);
      if (!best || rank > best.rank) best = { id: def.id, name: def.name, rank };
    }

    const dayKey = getZonedToday(tz);
    await LookReactionModel.updateOne(
      { fromUserId: userId, toUserId, dayKey },
      {
        $set: {
          kind,
          itemId: best?.id ?? null,
          itemName: best?.name ?? null,
        },
        $setOnInsert: { seen: false, createdAt: new Date() },
      },
      { upsert: true },
    );

    void notifyFriendUpdate(toUserId);
    await recordAnalyticsEvent({
      userId,
      name: 'look_reaction_sent',
      properties: { kind, item_id: best?.id ?? null },
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
