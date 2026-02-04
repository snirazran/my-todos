export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type WardrobeSlot = 'skin' | 'hat' | 'scarf' | 'hand_item' | 'glasses' | 'container';

export type ItemDef = {
  id: string;
  name: string;
  slot: WardrobeSlot;
  rarity: Rarity;
  riveIndex: number;
  icon: string; // Keep for fallback or other UI
  priceFlies?: number;
};

export const RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;

export const rarityRank: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const CATALOG: Readonly<ItemDef[]> = [
  // --- SKINS ---
  {
    id: 'skin_blue',
    name: 'Blue Frog',
    slot: 'skin',
    rarity: 'uncommon',
    riveIndex: 1,
    icon: '/skins/skin/skin1.png', // Placeholder path
    priceFlies: 400,
  },
  {
    id: 'skin_pink',
    name: 'Pink Frog',
    slot: 'skin',
    rarity: 'rare',
    riveIndex: 2,
    icon: '/skins/skin/skin3.png', // Placeholder path
    priceFlies: 900,
  },

  // --- HATS ---
  {
    id: 'hat_wizard',
    name: 'Wizard Hat',
    slot: 'hat',
    rarity: 'legendary',
    riveIndex: 1,
    icon: '/skins/hat/hat2.png', // Placeholder path
    priceFlies: 2500,
  },
  {
    id: 'hat_santa',
    name: 'Santa Hat',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 2,
    icon: '/skins/hat/hat2.png', // Placeholder path
    priceFlies: 1500,
  },
  {
    id: 'hat_headphones',
    name: 'Headphones',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 3,
    icon: '/skins/hat/hat3.png', // Placeholder path
    priceFlies: 1800,
  },
  {
    id: 'hat_pirate',
    name: 'Pirate Hat',
    slot: 'hat',
    rarity: 'rare',
    riveIndex: 4,
    icon: '/skins/hat/hat4.png', // Placeholder path
    priceFlies: 1500,
  },

  // --- GLASSES ---
  {
    id: 'glasses_patch',
    name: 'Eye Patch',
    slot: 'glasses',
    rarity: 'rare',
    riveIndex: 1,
    icon: '/skins/glasses/glasses1.png', // Placeholder path
    priceFlies: 1200,
  },

  // --- SCARVES ---
  {
    id: 'scarf_red',
    name: 'Red Scarf',
    slot: 'scarf',
    rarity: 'common',
    riveIndex: 1,
    icon: '/skins/scarf/scarf1.png', // Placeholder path
    priceFlies: 250,
  },

  // --- HAND ---
  {
    id: 'hand_wand',
    name: 'Wizard Wand',
    slot: 'hand_item',
    rarity: 'legendary',
    riveIndex: 1,
    icon: '/skins/hand/hand1.png', // Placeholder path
    priceFlies: 3000,
  },
  {
    id: 'hand_controller',
    name: 'Controller',
    slot: 'hand_item',
    rarity: 'epic',
    riveIndex: 2,
    icon: '/skins/hand/hand2.png', // Placeholder path
    priceFlies: 2000,
  },
  {
    id: 'hand_sword',
    name: 'Pirate Sword',
    slot: 'hand_item',
    rarity: 'rare',
    riveIndex: 3,
    icon: '/skins/hand/hand3.png', // Placeholder path
    priceFlies: 1600,
  },

  // --- CONTAINERS ---
  {
    id: 'gift_box_1',
    name: 'Mystery Gift Box',
    slot: 'container',
    rarity: 'common',
    riveIndex: 0,
    icon: '/skins/container/gift.png',
    priceFlies: 500,
  },
];

export const byId: Readonly<Record<string, ItemDef>> = Object.freeze(
  Object.fromEntries(CATALOG.map((s) => [s.id, s]))
);

export const sortByRarity = <T extends ItemDef>(arr: T[]) =>
  [...arr].sort(
    (a, b) =>
      rarityRank[a.rarity] - rarityRank[b.rarity] ||
      a.slot.localeCompare(b.slot) ||
      a.riveIndex - b.riveIndex
  );
