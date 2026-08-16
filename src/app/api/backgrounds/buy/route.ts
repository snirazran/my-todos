import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { isTradeOnlyRarity } from '@/lib/skins/catalog';
import { dropFromWishlist } from '@/lib/skins/wishlistServer';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id;
    if (!id) return json({ error: 'Missing background id' }, 400);
    if (id === DEFAULT_BACKGROUND_ID)
      return json({ error: 'You already have this one' }, 400);

    await connectMongo();
    const bg = await BackgroundModel.findOne({ id, hidden: { $ne: true } }).lean();
    if (!bg) return json({ error: 'Unknown background' }, 400);

    if (isTradeOnlyRarity(bg.rarity)) {
      return json({ error: 'This one can only be earned by trading up' }, 400);
    }

    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const price = bg.priceFlies ?? 0;

    const update = {
      $inc: {
        [`wardrobe.backgrounds.inventory.${id}`]: 1,
        'wardrobe.flies': -price,
      },
    };

    const result = await UserModel.updateOne(
      { _id: user._id, 'wardrobe.flies': { $gte: price } },
      update,
    );

    if (result.modifiedCount === 0) {
      return json({ error: 'Not enough flies' }, 400);
    }

    await dropFromWishlist(userId, user.wardrobe, id, 'background');

    const isPremium = !!user.premiumUntil && new Date(user.premiumUntil) > new Date();
    await recordAnalyticsEvent({
      userId,
      name: 'skin_purchased',
      properties: { rarity: bg.rarity, slot: 'background', flies_spent: price, discounted: false, is_premium: isPremium },
    });
    if (price > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_spent',
        properties: { source: 'background_shop', fly_amount: price, is_premium: isPremium },
      });
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
