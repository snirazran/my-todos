import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getGiftConfig, getRewardPool, rollGiftPrize } from '@/lib/skins/gifts';
import { ensureGiftRulesConfig } from '@/lib/models/GiftRulesConfig';
import { giftLuckUpdate, readUserGiftLuck } from '@/lib/skins/giftLuck';
import { readWishlistPins, wishlistPinKey } from '@/lib/skins/wishlist';
import { dropFromWishlist } from '@/lib/skins/wishlistServer';
import { DOUBLE_CLAIM_WINDOW_MS } from '@/lib/rewards/adDouble';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type GiftDoubleClaim = {
  id: string;
  giftBoxId: string;
  doubled: boolean;
  createdAt: Date | string;
};

type LeanUser = UserDoc & { _id: string; giftDoubleClaim?: GiftDoubleClaim };

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { claimId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const claimId = String(body.claimId ?? '');
  if (!claimId) return json({ error: 'Missing claimId' }, 400);

  try {
    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const claim = user.giftDoubleClaim;
    if (!claim || claim.id !== claimId || claim.doubled) {
      return json({ granted: false });
    }
    const age = Date.now() - new Date(claim.createdAt).getTime();
    if (age > DOUBLE_CLAIM_WINDOW_MS) {
      return json({ granted: false });
    }

    const giftConfig = await getGiftConfig(claim.giftBoxId);
    if (!giftConfig) return json({ error: 'Gift is not configured' }, 400);
    const [prizePool, rules] = await Promise.all([
      getRewardPool(),
      ensureGiftRulesConfig(),
    ]);

    // The ad-funded second open is a full reveal: it feeds Luck and obeys the
    // same duplicate rules as the first one.
    const itemInv = user.wardrobe?.inventory ?? {};
    const bgInv = user.wardrobe?.backgrounds?.inventory ?? {};
    const ownedOf = (p: { kind: string; id: string }) =>
      (p.kind === 'background' ? bgInv[p.id] : itemInv[p.id]) ?? 0;
    const roll = rollGiftPrize({
      config: giftConfig,
      prizePool,
      rules,
      luck: readUserGiftLuck(user),
      owns: (p) => ownedOf(p) > 0,
      wishlistKeys: new Set(
        readWishlistPins(user.wardrobe).map((pin) => wishlistPinKey(pin)),
      ),
    });
    if (!roll) return json({ error: 'Gift has no available drops' }, 400);
    const prize = roll.prize;

    const currentUnseen = user.wardrobe?.unseenItems || [];
    const nextUnseen = [...currentUnseen];
    const inc: Record<string, number> = {};
    const set: Record<string, unknown> = {
      'giftDoubleClaim.doubled': true,
      giftLuck: giftLuckUpdate(roll.luck),
    };
    if (prize.kind === 'background') {
      inc[`wardrobe.backgrounds.inventory.${prize.id}`] = 1;
    } else {
      inc[`wardrobe.inventory.${prize.id}`] = 1;
      if (!nextUnseen.includes(prize.id)) nextUnseen.push(prize.id);
      set['wardrobe.unseenItems'] = nextUnseen;
      if (!user.wardrobe?.inventoryHistory?.[prize.id]) {
        set[`wardrobe.inventoryHistory.${prize.id}`] = new Date().toISOString();
      }
    }

    const res = await UserModel.updateOne(
      {
        _id: user._id,
        'giftDoubleClaim.id': claimId,
        'giftDoubleClaim.doubled': false,
      },
      { $inc: inc, $set: set },
    );
    if (res.modifiedCount === 0) {
      return json({ granted: false });
    }

    await dropFromWishlist(userId, user.wardrobe, prize.id, prize.kind);

    return json({
      granted: true,
      ok: true,
      prize,
      prizeMeta: {
        duplicate: roll.duplicate,
        owned: ownedOf(prize) + 1,
        fromWishlist: roll.viaWishlist,
        tierBumped: roll.tierBumped,
      },
    });
  } catch (err) {
    console.error('Gift double failed:', err);
    return json({ error: 'Double failed' }, 500);
  }
}
