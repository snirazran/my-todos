import UserModel from '@/lib/models/User';
import { rarityRank, type Rarity } from '@/lib/skins/catalog';
import { buildById, getCachedCatalog } from '@/lib/skins/getCatalog';

export type PlusEarned = {
  since?: string | null;
  flies: number;
  rareItems: number;
};

export function readPlusEarned(raw: unknown): PlusEarned {
  const value = (raw ?? {}) as Partial<PlusEarned>;
  return {
    since: typeof value.since === 'string' ? value.since : null,
    flies: Math.max(0, Number(value.flies) || 0),
    rareItems: Math.max(0, Number(value.rareItems) || 0),
  };
}

export function plusFlyBonus(granted: number, multiplier: number) {
  if (!(multiplier > 1) || !(granted > 0)) return 0;
  return granted - Math.round(granted / multiplier);
}

export function isRareOutfit(
  item: { rarity?: string; slot?: string; kind?: string } | null | undefined,
) {
  if (!item || item.kind === 'background' || item.slot === 'container') {
    return false;
  }
  const rank = rarityRank[item.rarity as Rarity];
  return rank !== undefined && rank >= rarityRank.rare;
}

export async function countRareOutfits(itemIds: string[]) {
  if (!itemIds.length) return 0;
  const byId = buildById(await getCachedCatalog());
  return itemIds.filter((id) => isRareOutfit(byId[id])).length;
}

export async function recordPlusEarned(
  userId: string,
  earned: { flies?: number; rareItems?: number },
) {
  const flies = Math.max(0, Math.round(earned.flies ?? 0));
  const rareItems = Math.max(0, Math.round(earned.rareItems ?? 0));
  if (!flies && !rareItems) return;
  try {
    await UserModel.updateOne(
      { _id: userId },
      { $inc: { 'plusEarned.flies': flies, 'plusEarned.rareItems': rareItems } },
    );
  } catch (err) {
    console.error('Plus earned record failed:', err);
  }
}

export async function resetPlusEarned(userId: string, since: string) {
  await UserModel.updateOne(
    { _id: userId, 'plusEarned.since': { $ne: since } },
    { $set: { plusEarned: { since, flies: 0, rareItems: 0 } } },
  );
}
