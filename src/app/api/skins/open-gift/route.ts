import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import {
  getGiftConfig,
  getRewardPool,
  rollGiftPrize,
  type GiftRollResult,
} from '@/lib/skins/gifts';
import { ensureGiftRulesConfig } from '@/lib/models/GiftRulesConfig';
import { giftLuckUpdate, readUserGiftLuck } from '@/lib/skins/giftLuck';
import { readWishlistPins, wishlistPinKey } from '@/lib/skins/wishlist';
import { dropFromWishlist } from '@/lib/skins/wishlistServer';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

/** What the reveal needs to know about a prize beyond the prize itself. */
const revealMeta = (roll: GiftRollResult, owned: number) => ({
  duplicate: roll.duplicate,
  /** Copies owned after this grant — the "×N spare" the card shows. */
  owned,
  fromWishlist: roll.viaWishlist,
  tierBumped: roll.tierBumped,
});

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

    const giftConfig = await getGiftConfig(giftBoxId);
    if (!giftConfig) return json({ error: 'Gift is not configured' }, 400);

    await connectMongo();
    const [prizePool, rules, user] = await Promise.all([
      getRewardPool(),
      ensureGiftRulesConfig(),
      UserModel.findById(userId).lean() as Promise<LeanUser | null>,
    ]);
    if (!user) return json({ error: 'User not found' }, 404);

    const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
    const owned = wardrobe.inventory[giftBoxId] || 0;

    if (owned < 1) {
      return json({ error: 'You do not have any gift boxes to open' }, 403);
    }

    // Ownership is read once and then kept in step with what this request
    // grants, so a Plus second roll weights against the first roll's prize.
    const ownedCounts = new Map<string, number>();
    const countKey = (kind: string, id: string) => `${kind}:${id}`;
    Object.entries(wardrobe.inventory ?? {}).forEach(([id, count]) =>
      ownedCounts.set(countKey('item', id), count ?? 0),
    );
    Object.entries(user.wardrobe?.backgrounds?.inventory ?? {}).forEach(
      ([id, count]) => ownedCounts.set(countKey('background', id), count ?? 0),
    );
    const ownedOf = (prize: { kind: string; id: string }) =>
      ownedCounts.get(countKey(prize.kind, prize.id)) ?? 0;
    const owns = (prize: { kind: string; id: string }) => ownedOf(prize) > 0;

    const wishlistKeys = new Set(
      readWishlistPins(user.wardrobe).map((pin) => wishlistPinKey(pin)),
    );

    let luck = readUserGiftLuck(user);
    const roll = rollGiftPrize({
      config: giftConfig,
      prizePool,
      rules,
      luck,
      owns,
      wishlistKeys,
    });
    if (!roll) return json({ error: 'Gift has no available drops' }, 400);
    luck = roll.luck;

    /** Copies owned once this roll is granted, captured before any later roll. */
    const grant = (entry: GiftRollResult) => {
      const next = ownedOf(entry.prize) + 1;
      ownedCounts.set(countKey(entry.prize.kind, entry.prize.id), next);
      return next;
    };
    const revealed: { roll: GiftRollResult; owned: number }[] = [
      { roll, owned: grant(roll) },
    ];

    // Premium users get a second independent roll of the same gift table;
    // free users get a claim record to redeem the second roll via a rewarded ad.
    const premium = user.premiumUntil
      ? new Date(user.premiumUntil) > new Date()
      : false;
    if (premium) {
      const bonus = rollGiftPrize({
        config: giftConfig,
        prizePool,
        rules,
        luck,
        owns,
        wishlistKeys,
      });
      if (bonus) {
        luck = bonus.luck;
        revealed.push({ roll: bonus, owned: grant(bonus) });
      }
    }

    // Atomic swap: decrement box, increment prize(s) & update unseen items.
    // We calculate the new unseen list to avoid conflicting $pull and $addToSet
    // on the same field.
    const currentUnseen = user.wardrobe?.unseenItems || [];
    const nextUnseen = currentUnseen.filter((id) => id !== giftBoxId);
    const inc: Record<string, number> = {
      [`wardrobe.inventory.${giftBoxId}`]: -1,
    };
    const set: Record<string, unknown> = { giftLuck: giftLuckUpdate(luck) };
    for (const entry of revealed) {
      const p = entry.roll.prize;
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

    // A slot held by something they now own is a slot they can't use.
    for (const entry of revealed) {
      await dropFromWishlist(
        userId,
        user.wardrobe,
        entry.roll.prize.id,
        entry.roll.prize.kind,
      );
    }

    const bonus = premium ? revealed[1] ?? null : null;
    return json({
      ok: true,
      prize: roll.prize,
      prizeMeta: revealMeta(roll, revealed[0].owned),
      bonusPrize: bonus?.roll.prize ?? null,
      bonusPrizeMeta: bonus ? revealMeta(bonus.roll, bonus.owned) : null,
      doubleClaimId,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
