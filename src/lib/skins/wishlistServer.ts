import BackgroundModel from '@/lib/models/Background';
import type { ItemDef } from './catalog';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import {
  catalogToWishlistSource,
  isWishlistPin,
  resolveWishlist,
  type WishlistSource,
  type WishlistView,
} from './wishlist';

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

/**
 * Resolve the stored pin into everything the client needs to render the
 * "saving for" goal without a second round-trip. Returns null when the pin is
 * missing or points at something that has since left the shop.
 */
export async function loadWishlistView(
  wardrobe: Pick<UserWardrobe, 'wishlist' | 'inventory' | 'backgrounds'> | null | undefined,
  catalog: ItemDef[],
): Promise<WishlistView | null> {
  const pin = wardrobe?.wishlist;
  if (!isWishlistPin(pin)) return null;
  const source = await loadSource(pin.itemId, pin.kind, catalog);
  const inventory =
    pin.kind === 'background'
      ? wardrobe?.backgrounds?.inventory
      : wardrobe?.inventory;
  return resolveWishlist(pin, source, inventory);
}
