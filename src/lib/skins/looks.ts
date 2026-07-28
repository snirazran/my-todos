import type { ItemDef, WardrobeSlot } from './catalog';
import { rarityRank } from './catalog';

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
  /** False when a piece was sold since saving — the look still applies, minus that slot. */
  complete: boolean;
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

export function isEmptyLook(
  equipped: Partial<Record<WardrobeSlot, string | null>>,
  backgroundId?: string | null,
): boolean {
  return (
    !backgroundId && LOOK_SLOTS.every((slot) => !(equipped[slot] ?? null))
  );
}

/**
 * Name a look after the piece that defines it — the rarest thing worn — so the
 * saved row reads as "Wizard fit", not "Look 3".
 */
export function autoNameLook(
  equipped: Partial<Record<WardrobeSlot, string | null>>,
  byId: Record<string, ItemDef>,
  taken: string[] = [],
): string {
  let best: ItemDef | null = null;
  for (const slot of LOOK_SLOTS) {
    const id = equipped[slot];
    const def = id ? byId[id] : null;
    if (!def) continue;
    if (!best || rarityRank[def.rarity] > rarityRank[best.rarity]) best = def;
  }
  const base = best ? `${best.name} fit` : 'Plain fit';
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return base;
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
