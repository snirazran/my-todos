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
};
