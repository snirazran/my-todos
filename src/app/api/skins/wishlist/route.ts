import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { availabilityStateAt } from '@/lib/skins/availability';
import { loadWishlistView } from '@/lib/skins/wishlistServer';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { WishlistKind, WishlistPin } from '@/lib/skins/wishlist';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = (await UserModel.findById(userId)
      .select('wardrobe')
      .lean()) as LeanUser | null;
    const catalog = await getFullCatalog();
    return json({ wishlist: await loadWishlistView(user?.wardrobe, catalog) });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { itemId?: unknown; kind?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const kind: WishlistKind = body.kind === 'background' ? 'background' : 'item';
    if (!itemId) return json({ error: 'Missing itemId' }, 400);

    await connectMongo();
    const catalog = await getFullCatalog();

    if (kind === 'item') {
      const def = buildById(catalog)[itemId];
      if (!def) return json({ error: 'Unknown itemId' }, 400);
      if (def.slot === 'container')
        return json({ error: 'Gifts cannot be pinned' }, 400);
      if (availabilityStateAt(def) === 'expired')
        return json({ error: 'This item has left the shop' }, 400);
      if ((def.priceFlies ?? 0) <= 0)
        return json({ error: 'This item is not for sale' }, 400);
    } else {
      const bg = await BackgroundModel.exists({
        id: itemId,
        hidden: { $ne: true },
      });
      if (!bg) return json({ error: 'Unknown background' }, 400);
    }

    const pin: WishlistPin = {
      itemId,
      kind,
      pinnedAt: new Date().toISOString(),
    };
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'wardrobe.wishlist': pin } },
    );

    const user = (await UserModel.findById(userId)
      .select('wardrobe')
      .lean()) as LeanUser | null;
    const wishlist = await loadWishlistView(user?.wardrobe, catalog);
    if (!wishlist) return json({ error: 'Could not pin this item' }, 400);

    await recordAnalyticsEvent({
      userId,
      name: 'wishlist_pinned',
      properties: {
        item_id: itemId,
        kind,
        price: wishlist.price,
        balance: user?.wardrobe?.flies ?? 0,
      },
    });

    return json({ ok: true, wishlist });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $unset: { 'wardrobe.wishlist': '' } },
    );
    return json({ ok: true, wishlist: null });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
