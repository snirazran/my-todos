import type { ItemDef, WardrobeSlot } from './catalog';

/**
 * Slots are convenience, not power — the one category the economy doc allows
 * selling. Free keeps enough to be genuinely useful (a work fit, a fun fit, a
 * favourite) so the feature never feels like a demo.
 */
export const SAVED_LOOKS_FREE = 3;
export const SAVED_LOOKS_PLUS = 12;

export function maxSavedLooks(isPremium: boolean): number {
  return isPremium ? SAVED_LOOKS_PLUS : SAVED_LOOKS_FREE;
}

export const LOOK_SLOTS: WardrobeSlot[] = ['skin', 'hat', 'body', 'hand_item'];

export type SavedLook = {
  id: string;
  name: string;
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  backgroundId?: string | null;
  createdAt: string;
};

export type SavedLookView = SavedLook & {
  /** Rive indices for previewing without a second catalog lookup. */
  indices: Record<'skin' | 'hat' | 'body' | 'hand_item', number>;
  /** False when a piece was sold since saving — such looks are dropped on read. */
  complete: boolean;
  /** Saved background art, so the card previews the whole scene. */
  backgroundImage?: string | null;
};

export function isSavedLook(value: unknown): value is SavedLook {
  if (!value || typeof value !== 'object') return false;
  const look = value as Partial<SavedLook>;
  return typeof look.id === 'string' && typeof look.name === 'string';
}

/** Same four slots pointing at the same items = the same outfit. */
export function looksMatch(
  a: Partial<Record<WardrobeSlot, string | null>>,
  b: Partial<Record<WardrobeSlot, string | null>>,
  aBg?: string | null,
  bBg?: string | null,
): boolean {
  for (const slot of LOOK_SLOTS) {
    if ((a[slot] ?? null) !== (b[slot] ?? null)) return false;
  }
  return (aBg ?? null) === (bBg ?? null);
}

export const LOOK_NAME_MAX = 24;

export function nextOutfitName(taken: string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  let n = 1;
  while (used.has(`#outfit${n}`)) n += 1;
  return `#outfit${n}`;
}

export function isEmptyLook(
  equipped: Partial<Record<WardrobeSlot, string | null>>,
  backgroundId?: string | null,
): boolean {
  return (
    !backgroundId && LOOK_SLOTS.every((slot) => !(equipped[slot] ?? null))
  );
}

export function toLookView(
  look: SavedLook,
  byId: Record<string, ItemDef>,
  inventory: Record<string, number>,
): SavedLookView {
  const idx = (id?: string | null) => (id ? (byId[id]?.riveIndex ?? 0) : 0);
  const complete = LOOK_SLOTS.every((slot) => {
    const id = look.equipped[slot];
    return !id || (inventory[id] ?? 0) > 0;
  });
  return {
    ...look,
    indices: {
      skin: idx(look.equipped.skin),
      hat: idx(look.equipped.hat),
      body: idx(look.equipped.body),
      hand_item: idx(look.equipped.hand_item),
    },
    complete,
  };
}
