import type { Rarity } from './catalog';
import { isObtainableAt } from './availability';
import type { GiftPrize } from './gifts';
import type { TradeModifiers } from './tradeModifiers';

export const prizeKey = (prize: { kind: string; id: string }) =>
  `${prize.kind}:${prize.id}`;

const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function pickTradeReward({
  pool,
  rarity,
  owns,
  wishlistKeys,
  modifiers,
  exclude,
}: {
  pool: GiftPrize[];
  rarity: Rarity;
  owns: (prize: GiftPrize) => boolean;
  wishlistKeys: Set<string>;
  modifiers: TradeModifiers;
  exclude?: GiftPrize | null;
}): GiftPrize | null {
  const excluded = exclude ? prizeKey(exclude) : null;
  const candidates = pool.filter(
    (prize) =>
      prize.rarity === rarity &&
      prize.slot !== 'container' &&
      isObtainableAt(prize) &&
      prizeKey(prize) !== excluded,
  );
  if (candidates.length === 0) return null;

  const fresh = candidates.filter((prize) => !owns(prize));
  const wishlisted = fresh.filter((prize) => wishlistKeys.has(prizeKey(prize)));
  if (
    wishlisted.length > 0 &&
    Math.random() * 100 < modifiers.wishlistRedirectPercent
  ) {
    return pickOne(wishlisted);
  }
  return pickOne(fresh.length > 0 ? fresh : candidates);
}
