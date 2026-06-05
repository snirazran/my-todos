import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { getGiftConfig, pickGiftDrop } from '@/lib/skins/gifts';
import type { UserWardrobe } from '@/lib/types/UserDoc';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { giftBoxId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const giftBoxId = body.giftBoxId;

    const fullCatalog = await getFullCatalog();
    const byId = buildById(fullCatalog);

    if (!giftBoxId || !byId[giftBoxId])
      return json({ error: 'Unknown giftBoxId' }, 400);

    const containerDef = byId[giftBoxId];
    if (containerDef.slot !== 'container') {
      return json({ error: 'Item is not a gift box' }, 400);
    }

    // 1. Pick a prize from the DB-backed gift drop table.
    const giftConfig = await getGiftConfig(giftBoxId);
    if (!giftConfig) return json({ error: 'Gift is not configured' }, 400);

    const prize = pickGiftDrop(giftConfig, fullCatalog);
    if (!prize) return json({ error: 'Gift has no available drops' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
    const owned = wardrobe.inventory[giftBoxId] || 0;

    if (owned < 1) {
      return json({ error: 'You do not have any gift boxes to open' }, 403);
    }

    // 2. Atomic swap: decrement box, increment prize & update unseen items
    // We calculate the new unseen list to avoid conflicting $pull and $addToSet on the same field
    const currentUnseen = user.wardrobe?.unseenItems || [];
    const nextUnseen = currentUnseen.filter((id) => id !== giftBoxId);
    // Add prize if not already present (though $addToSet logic implies set behavior, we do it manually for $set)
    if (!nextUnseen.includes(prize.id)) {
      nextUnseen.push(prize.id);
    }

    const update: any = {
      $inc: {
        [`wardrobe.inventory.${giftBoxId}`]: -1,
        [`wardrobe.inventory.${prize.id}`]: 1,
      },
      $set: { 'wardrobe.unseenItems': nextUnseen },
    };

    // Only set history if not already present
    if (!user.wardrobe?.inventoryHistory?.[prize.id]) {
      update.$set[`wardrobe.inventoryHistory.${prize.id}`] = new Date().toISOString();
    }

    await UserModel.updateOne({ _id: user._id }, update);

    return json({ ok: true, prize });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
