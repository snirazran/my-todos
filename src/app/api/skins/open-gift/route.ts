import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { getGiftConfig, pickGiftDrop, getPrizePool } from '@/lib/skins/gifts';
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

    const prizePool = await getPrizePool();
    const prize = pickGiftDrop(giftConfig, prizePool);
    if (!prize) return json({ error: 'Gift has no available drops' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
    const owned = wardrobe.inventory[giftBoxId] || 0;

    if (owned < 1) {
      return json({ error: 'You do not have any gift boxes to open' }, 403);
    }

    // Premium users get a second independent roll of the same gift table;
    // free users get a claim record to redeem the second roll via a rewarded ad.
    const premium = user.premiumUntil
      ? new Date(user.premiumUntil) > new Date()
      : false;
    const prizes = [prize];
    if (premium) {
      const bonus = pickGiftDrop(giftConfig, prizePool);
      if (bonus) prizes.push(bonus);
    }

    // 2. Atomic swap: decrement box, increment prize(s) & update unseen items
    // We calculate the new unseen list to avoid conflicting $pull and $addToSet on the same field
    const currentUnseen = user.wardrobe?.unseenItems || [];
    const nextUnseen = currentUnseen.filter((id) => id !== giftBoxId);
    const inc: Record<string, number> = {
      [`wardrobe.inventory.${giftBoxId}`]: -1,
    };
    const set: Record<string, unknown> = {};
    for (const p of prizes) {
      if (p.kind === 'background') {
        const key = `wardrobe.backgrounds.inventory.${p.id}`;
        inc[key] = (inc[key] ?? 0) + 1;
      } else {
        const key = `wardrobe.inventory.${p.id}`;
        inc[key] = (inc[key] ?? 0) + 1;
        if (!nextUnseen.includes(p.id)) nextUnseen.push(p.id);
        if (
          !user.wardrobe?.inventoryHistory?.[p.id] &&
          !set[`wardrobe.inventoryHistory.${p.id}`]
        ) {
          set[`wardrobe.inventoryHistory.${p.id}`] = new Date().toISOString();
        }
      }
    }
    set['wardrobe.unseenItems'] = nextUnseen;

    let doubleClaimId: string | undefined;
    if (!premium) {
      doubleClaimId = randomUUID();
      set['giftDoubleClaim'] = {
        id: doubleClaimId,
        giftBoxId,
        doubled: false,
        createdAt: new Date(),
      };
    }

    await UserModel.updateOne({ _id: user._id }, { $inc: inc, $set: set });

    return json({
      ok: true,
      prize,
      bonusPrize: premium ? prizes[1] ?? null : null,
      doubleClaimId,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
