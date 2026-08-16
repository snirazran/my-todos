import BackgroundModel from '@/lib/models/Background';
import UserModel from '@/lib/models/User';
import { ensureTradeModifiersConfig } from '@/lib/models/TradeModifiersConfig';
import { wishlistSlots } from '@/lib/skins/tradeModifiers';
import type { ItemDef } from './catalog';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import {
  catalogToWishlistSource,
  pickWishlistGoal,
  readWishlistPins,
  resolveWishlist,
  wishlistPinKey,
  type WishlistKind,
  type WishlistPin,
  type WishlistSource,
  type WishlistState,
  type WishlistView,
} from './wishlist';

type WishlistWardrobe = Pick<
  UserWardrobe,
  'wishlist' | 'wishlistItems' | 'inventory' | 'backgrounds'
>;

async function loadSource(
  itemId: string,
  kind: 'item' | 'background',
  catalog: ItemDef[],
): Promise<WishlistSource | null> {
  if (kind === 'item') {
    const item = catalog.find((entry) => entry.id === itemId);
    return item ? catalogToWishlistSource(item) : null;
  }
  const bg = await BackgroundModel.findOne({
    id: itemId,
    hidden: { $ne: true },
  }).lean();
  if (!bg) return null;
  return {
    id: bg.id,
    name: bg.name,
    rarity: bg.rarity,
    priceFlies: bg.priceFlies,
    imageUrl:
      bg.images?.mobile ||
      bg.images?.tablet ||
      bg.images?.web ||
      bg.images?.webLarge ||
      '',
  };
}

async function resolvePin(
  pin: WishlistPin,
  wardrobe: WishlistWardrobe | null | undefined,
  catalog: ItemDef[],
): Promise<WishlistView | null> {
  const source = await loadSource(pin.itemId, pin.kind, catalog);
  const inventory =
    pin.kind === 'background'
      ? wardrobe?.backgrounds?.inventory
      : wardrobe?.inventory;
  return resolveWishlist(pin, source, inventory);
}

/**
 * Resolve every stored pin into what the client needs to render the list and
 * the countdown without a second round-trip. Pins pointing at something that
 * has since left the shop drop out.
 */
export async function loadWishlistState(
  wardrobe: WishlistWardrobe | null | undefined,
  catalog: ItemDef[],
  isPremium: boolean,
): Promise<WishlistState> {
  const pins = readWishlistPins(wardrobe);
  const resolved = await Promise.all(
    pins.map((pin) => resolvePin(pin, wardrobe, catalog)),
  );
  const items = resolved.filter((entry): entry is WishlistView => !!entry);
  const modifiers = await ensureTradeModifiersConfig();
  return {
    goal: pickWishlistGoal(items),
    items,
    slots: { used: items.length, max: wishlistSlots(modifiers, isPremium) },
  };
}

/**
 * Take something the player just acquired off their list. A slot held by an
 * item they already own is a slot they can't use.
 */
export async function dropFromWishlist(
  userId: string,
  wardrobe: WishlistWardrobe | null | undefined,
  itemId: string,
  kind: WishlistKind,
) {
  const pins = readWishlistPins(wardrobe);
  const key = wishlistPinKey({ itemId, kind });
  if (!pins.some((pin) => wishlistPinKey(pin) === key)) return;
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        'wardrobe.wishlistItems': pins.filter(
          (pin) => wishlistPinKey(pin) !== key,
        ),
      },
      $unset: { 'wardrobe.wishlist': '' },
    },
  );
}

/** @deprecated Use `loadWishlistState` — kept for callers that only want the goal. */
export async function loadWishlistView(
  wardrobe: WishlistWardrobe | null | undefined,
  catalog: ItemDef[],
): Promise<WishlistView | null> {
  const pins = readWishlistPins(wardrobe);
  const resolved = await Promise.all(
    pins.map((pin) => resolvePin(pin, wardrobe, catalog)),
  );
  return pickWishlistGoal(
    resolved.filter((entry): entry is WishlistView => !!entry),
  );
}
