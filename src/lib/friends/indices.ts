import type { ItemDef, Rarity, WardrobeSlot } from '@/lib/skins/catalog';
import { rarityRank } from '@/lib/skins/catalog';

export type FrogIndices = {
  skin: number;
  hat: number;
  body: number;
  hand_item: number;
};

export function equippedToIndices(
  equipped: Partial<Record<string, string | null>> | undefined,
  byId: Record<string, ItemDef>,
): FrogIndices {
  const getIndex = (itemId?: string | null) => {
    if (!itemId) return 0;
    return byId[itemId]?.riveIndex ?? 0;
  };
  return {
    skin: getIndex(equipped?.skin),
    hat: getIndex(equipped?.hat),
    body: getIndex(equipped?.body),
    hand_item: getIndex(equipped?.hand_item),
  };
}

export type FriendSummary = {
  userId: string;
  name: string;
  frogName: string;
  indices: FrogIndices;
  fliesToday: number;
  /** Flies this friend contributes to you today (floor of their flies / 2). */
  givesYou?: number;
  /** The friend's equipped background id (resolved to images on the client). */
  backgroundId?: string | null;
  /** Lifetime flies this friend has contributed to you (claimed). */
  sharedTotal?: number;
  /** Current alive login-streak count (0 when broken/none). */
  streak?: number;
  /** Whether this user has an active premium subscription. */
  premium?: boolean;
  /** Catalog details of this friend's equipped wardrobe items. */
  equippedItems?: FriendEquippedItem[];
  /** Highest rarity among this friend's equipped items. */
  flexRarity?: Rarity | null;
};

export type FriendEquippedItem = {
  id: string;
  name: string;
  slot: WardrobeSlot;
  rarity: Rarity;
  riveIndex: number;
  priceFlies: number;
  icon: string;
};

export function equippedToItems(
  equipped: Partial<Record<string, string | null>> | undefined,
  byId: Record<string, ItemDef>,
): FriendEquippedItem[] {
  const items: FriendEquippedItem[] = [];
  for (const slot of ['skin', 'hat', 'body', 'hand_item'] as const) {
    const id = equipped?.[slot];
    const def = id ? byId[id] : null;
    if (!def) continue;
    items.push({
      id: def.id,
      name: def.name,
      slot: def.slot,
      rarity: def.rarity,
      riveIndex: def.riveIndex,
      priceFlies: def.priceFlies ?? 0,
      icon: def.icon,
    });
  }
  return items;
}

export function highestRarity(
  items: FriendEquippedItem[],
): Rarity | null {
  let top: Rarity | null = null;
  for (const item of items) {
    if (!top || rarityRank[item.rarity] > rarityRank[top]) top = item.rarity;
  }
  return top;
}

/** Flies a friend's daily catch contributes to you: every 2 → 1. */
export function contributionFrom(fliesToday: number): number {
  return Math.floor(Math.max(0, fliesToday) / 2);
}
