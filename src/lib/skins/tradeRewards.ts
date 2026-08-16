import type { Rarity } from './catalog';
import { isAvailableAt } from './availability';
import type { GiftPrize } from './gifts';
import type { TradeModifiers } from './tradeModifiers';

export const prizeKey = (prize: { kind: string; id: string }) =>
  `${prize.kind}:${prize.id}`;

/**
 * What aiming can actually land. Filtered exactly like the draw, so a wishlist
 * full of out-of-season items can't sell an aim that has nothing to hit.
 */
export function aimableTradeTargets({
  pool,
  rarity,
  owns,
  wishlistKeys,
}: {
  pool: GiftPrize[];
  rarity: Rarity;
  owns: (prize: GiftPrize) => boolean;
  wishlistKeys: Set<string>;
}): GiftPrize[] {
  return pool.filter(
    (prize) =>
      prize.rarity === rarity &&
      prize.slot !== 'container' &&
      isAvailableAt(prize) &&
      wishlistKeys.has(prizeKey(prize)) &&
      !owns(prize),
  );
}

/**
 * Un-owned candidates outweigh owned ones so new items dominate the draw while
 * any remain, without ever making a duplicate impossible.
 */
function drawWeighted(
  candidates: GiftPrize[],
  owns: (prize: GiftPrize) => boolean,
  newFirstWeight: number,
): GiftPrize | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((prize) =>
    owns(prize) ? 1 : Math.max(1, newFirstWeight),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * The tier is guaranteed by the recipe — only the identity is drawn. The
 * wishlist gets first refusal, which is what makes it the one targeted route
 * to a legendary now that the shop doesn't sell them. Aiming pays flies to
 * turn that first refusal into a certainty.
 */
export function pickTradeReward({
  pool,
  rarity,
  owns,
  wishlistKeys,
  modifiers,
  newFirstWeight,
  aimed = false,
  exclude,
}: {
  pool: GiftPrize[];
  rarity: Rarity;
  owns: (prize: GiftPrize) => boolean;
  wishlistKeys: Set<string>;
  modifiers: TradeModifiers;
  newFirstWeight?: number;
  aimed?: boolean;
  exclude?: GiftPrize | null;
}): GiftPrize | null {
  const excluded = exclude ? prizeKey(exclude) : null;
  const candidates = pool.filter(
    (prize) =>
      prize.rarity === rarity &&
      prize.slot !== 'container' &&
      isAvailableAt(prize) &&
      prizeKey(prize) !== excluded,
  );
  if (candidates.length === 0) return null;

  const wishlisted = candidates.filter(
    (prize) => wishlistKeys.has(prizeKey(prize)) && !owns(prize),
  );
  if (aimed) {
    if (wishlisted.length === 0) return null;
    return wishlisted[Math.floor(Math.random() * wishlisted.length)];
  }
  if (
    wishlisted.length > 0 &&
    Math.random() * 100 < modifiers.wishlistRedirectPercent
  ) {
    return wishlisted[Math.floor(Math.random() * wishlisted.length)];
  }

  return drawWeighted(
    candidates,
    owns,
    newFirstWeight ?? modifiers.newFirstWeight,
  );
}
