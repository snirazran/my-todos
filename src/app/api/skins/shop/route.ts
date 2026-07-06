import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { getDailyDeals, isPremiumActive } from '@/lib/skins/dailyDeal';
import { bumpQuestMetric } from '@/lib/quests/metrics';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { itemId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const itemId = body.itemId;

    await connectMongo();
    const fullCatalog = await getFullCatalog();
    const byId = buildById(fullCatalog);
    if (!itemId || !byId[itemId]) return json({ error: 'Unknown itemId' }, 400);
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    // init if missing
    if (!user.wardrobe) {
      const init: UserWardrobe = {
        equipped: {},
        inventory: { [itemId]: 1 },
        inventoryHistory: { [itemId]: new Date().toISOString() },
        unseenItems: [itemId],
        flies: 0,
      };
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { wardrobe: init } },
      );
      await bumpQuestMetric({ userId, metric: 'skin_acquired' });
      return json({ ok: true });
    }

    // Check balance
    let price = byId[itemId].priceFlies ?? 0;
    const deal = getDailyDeals(fullCatalog).find((d) => d.itemId === itemId);
    if (deal && isPremiumActive(user.premiumUntil)) {
      price = deal.dealPrice;
    }

    // Transaction: Atomic check-and-update to prevent race conditions
    const update: any = {
      $inc: {
        [`wardrobe.inventory.${itemId}`]: 1,
        'wardrobe.flies': -price,
      },
      $addToSet: { 'wardrobe.unseenItems': itemId },
      $set: {},
    };

    // Only set history if not already present
    if (!user.wardrobe.inventoryHistory?.[itemId]) {
      update.$set[`wardrobe.inventoryHistory.${itemId}`] = new Date().toISOString();
    }
    if (Object.keys(update.$set).length === 0) delete update.$set;

    const result = await UserModel.updateOne(
      {
        _id: user._id,
        'wardrobe.flies': { $gte: price },
      },
      update,
    );

    if (result.modifiedCount === 0) {
      // Either user not found (unlikely) or not enough flies
      return json({ error: 'Not enough flies' }, 400);
    }

    await bumpQuestMetric({ userId, metric: 'skin_acquired' });

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
