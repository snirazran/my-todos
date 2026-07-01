import type { ItemDef } from '@/lib/skins/catalog';

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
};

/** Flies a friend's daily catch contributes to you: every 2 → 1. */
export function contributionFrom(fliesToday: number): number {
  return Math.floor(Math.max(0, fliesToday) / 2);
}
