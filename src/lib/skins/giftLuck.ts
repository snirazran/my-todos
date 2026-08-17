import UserModel from '@/lib/models/User';
import { rarityRank, type Rarity } from './catalog';
import {
  clearGiftLuck,
  readGiftLuck,
  type GiftLuckState,
} from './giftRules';

export type GiftLuckDoc = GiftLuckState & { updatedAt?: Date | string };

export function readUserGiftLuck(
  user: { giftLuck?: unknown } | null | undefined,
): GiftLuckState {
  return readGiftLuck(user?.giftLuck);
}

/** The `$set` payload for a reveal's counter update. */
export function giftLuckUpdate(state: GiftLuckState) {
  return { ...state, updatedAt: new Date() };
}

/**
 * A legendary or epic won anywhere else — a trade-up, a streak prize, a Leap
 * payout — has to clear the counter too, or pity would immediately hand out a
 * second one. Writes nothing when the prizes clear nothing.
 */
export async function clearGiftLuckForPrizes(
  userId: string,
  rarities: readonly Rarity[],
) {
  const relevant = rarities.filter(
    (rarity) => rarityRank[rarity] >= rarityRank.epic,
  );
  if (relevant.length === 0) return;

  const user = await UserModel.findById(userId).select('giftLuck').lean();
  if (!user) return;

  const before = readUserGiftLuck(user as { giftLuck?: unknown });
  const after = relevant.reduce(
    (state, rarity) => clearGiftLuck(state, rarity),
    before,
  );
  if (after.luck === before.luck && after.epicLuck === before.epicLuck) return;

  await UserModel.updateOne(
    { _id: userId },
    { $set: { giftLuck: giftLuckUpdate(after) } },
  ).catch(() => {});
}
