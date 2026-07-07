export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { FUNNEL_GIFT_ITEM_ID } from '@/lib/crossGift';

export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const result = await UserModel.updateOne(
      { _id: userId, funnelGift: null },
      {
        $set: {
          funnelGift: { itemId: FUNNEL_GIFT_ITEM_ID, grantedAt: new Date() },
          'platformsSeen.web': new Date(),
          'wardrobe.equipped.skin': FUNNEL_GIFT_ITEM_ID,
        },
        $inc: { [`wardrobe.inventory.${FUNNEL_GIFT_ITEM_ID}`]: 1 },
        $addToSet: { 'wardrobe.unseenItems': FUNNEL_GIFT_ITEM_ID },
      },
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ ok: true, alreadyClaimed: true });
    }

    return NextResponse.json({ ok: true, itemId: FUNNEL_GIFT_ITEM_ID });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
