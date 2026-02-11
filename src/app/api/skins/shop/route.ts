import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import { byId } from '@/lib/skins/catalog';

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
    if (!itemId || !byId[itemId]) return json({ error: 'Unknown itemId' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    // init if missing
    if (!user.wardrobe) {
      const init: UserWardrobe = {
        equipped: {},
        inventory: { [itemId]: 1 },
        flies: 0,
      };
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { wardrobe: init } },
      );
      return json({ ok: true });
    }

    // Check balance
    const price = byId[itemId].priceFlies ?? 0;

    // Transaction: Atomic check-and-update to prevent race conditions
    // We match the user AND ensure they have enough flies in the same query.
    const update: any = {
      $inc: {
        [`wardrobe.inventory.${itemId}`]: 1,
        'wardrobe.flies': -price,
      },
      $addToSet: { 'wardrobe.unseenItems': itemId },
    };

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

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
