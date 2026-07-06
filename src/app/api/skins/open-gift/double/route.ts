import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getGiftConfig, pickGiftDrop, getPrizePool } from '@/lib/skins/gifts';
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
    const prizePool = await getPrizePool();
    const prize = pickGiftDrop(giftConfig, prizePool);
    if (!prize) return json({ error: 'Gift has no available drops' }, 400);

    const currentUnseen = user.wardrobe?.unseenItems || [];
    const nextUnseen = [...currentUnseen];
    const inc: Record<string, number> = {};
    const set: Record<string, unknown> = {
      'giftDoubleClaim.doubled': true,
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

    return json({ granted: true, ok: true, prize });
  } catch (err) {
    console.error('Gift double failed:', err);
    return json({ error: 'Double failed' }, 500);
  }
}
