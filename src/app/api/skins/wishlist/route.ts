import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { availabilityStateAt } from '@/lib/skins/availability';
import { loadWishlistState } from '@/lib/skins/wishlistServer';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { ensureTradeModifiersConfig } from '@/lib/models/TradeModifiersConfig';
import { wishlistSlots } from '@/lib/skins/tradeModifiers';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  readWishlistPins,
  wishlistPinKey,
  type WishlistKind,
  type WishlistPin,
} from '@/lib/skins/wishlist';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

async function loadUser(userId: string) {
  return (await UserModel.findById(userId)
    .select('wardrobe premiumUntil')
    .lean()) as LeanUser | null;
}

/** One write keeps the list and drops the legacy single pin it replaced. */
async function savePins(userId: string, pins: WishlistPin[]) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { 'wardrobe.wishlistItems': pins },
      $unset: { 'wardrobe.wishlist': '' },
    },
  );
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = await loadUser(userId);
    const catalog = await getFullCatalog();
    const state = await loadWishlistState(
      user?.wardrobe,
      catalog,
      isPremiumActive(user?.premiumUntil),
    );
    return json({
      wishlist: state.goal,
      wishlistItems: state.items,
      wishlistSlots: state.slots,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

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

  const user = await loadUser(userId);
  const isPremium = isPremiumActive(user?.premiumUntil);
  const modifiers = await ensureTradeModifiersConfig();
  const max = wishlistSlots(modifiers, isPremium);

  const existing = readWishlistPins(user?.wardrobe);
  const key = wishlistPinKey({ itemId, kind });
  if (existing.some((pin) => wishlistPinKey(pin) === key)) {
    const state = await loadWishlistState(user?.wardrobe, catalog, isPremium);
    return json({
      ok: true,
      wishlist: state.goal,
      wishlistItems: state.items,
      wishlistSlots: state.slots,
    });
  }

  // A pin whose item has since left the shop resolves to nothing, so it never
  // shows up on the list — but it still occupied a slot the player could never
  // free. Count (and keep) only the pins that still resolve.
  const current = await loadWishlistState(user?.wardrobe, catalog, isPremium);
  const liveKeys = new Set(current.items.map((entry) => wishlistPinKey(entry)));
  const live = existing.filter((pin) => liveKeys.has(wishlistPinKey(pin)));

  if (live.length >= max) {
    return json(
      {
        error: isPremium
          ? `Your wishlist is full. Remove one to save this instead.`
          : `Your wishlist is full. Free up a slot, or unlock ${modifiers.wishlistSlotsPlus} with Plus.`,
        full: true,
        slots: { used: live.length, max },
      },
      400,
    );
  }

  const pins: WishlistPin[] = [
    { itemId, kind, pinnedAt: new Date().toISOString() },
    ...live,
  ];
  await savePins(userId, pins);

  const saved = await loadUser(userId);
  const state = await loadWishlistState(saved?.wardrobe, catalog, isPremium);
  const added = state.items.find(
    (entry) => wishlistPinKey(entry) === key,
  );
  if (!added) return json({ error: 'Could not pin this item' }, 400);

  await recordAnalyticsEvent({
    userId,
    name: 'wishlist_pinned',
    properties: {
      item_id: itemId,
      kind,
      price: added.price,
      balance: saved?.wardrobe?.flies ?? 0,
      list_size: state.items.length,
    },
  });

  return json({
    ok: true,
    wishlist: state.goal,
    wishlistItems: state.items,
    wishlistSlots: state.slots,
  });
}

export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  await connectMongo();
  const itemId = req.nextUrl.searchParams.get('itemId');
  const kind: WishlistKind =
    req.nextUrl.searchParams.get('kind') === 'background' ? 'background' : 'item';

  const user = await loadUser(userId);
  const existing = readWishlistPins(user?.wardrobe);
  const pins = itemId
    ? existing.filter(
        (pin) => wishlistPinKey(pin) !== wishlistPinKey({ itemId, kind }),
      )
    : [];
  await savePins(userId, pins);

  const catalog = await getFullCatalog();
  const saved = await loadUser(userId);
  const state = await loadWishlistState(
    saved?.wardrobe,
    catalog,
    isPremiumActive(user?.premiumUntil),
  );

  await recordAnalyticsEvent({
    userId,
    name: 'wishlist_cleared',
    properties: {
      item_id: itemId ?? 'all',
      kind,
      list_size: state.items.length,
      count: existing.length - pins.length,
    },
  });

  return json({
    ok: true,
    wishlist: state.goal,
    wishlistItems: state.items,
    wishlistSlots: state.slots,
  });
}
