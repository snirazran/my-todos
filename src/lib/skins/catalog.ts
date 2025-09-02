export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type WardrobeSlot = 'skin' | 'hat' | 'scarf' | 'hand_item';

export type ItemDef = {
  id: string; // stable id stored in DB
  name: string;
  slot: WardrobeSlot; // which Rive input this drives
  rarity: Rarity;
  riveIndex: number; // numeric value for that input
  icon: string; // /public path
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
  // Skins
  {
    id: 'skin_pink',
    name: 'Pink',
    slot: 'skin',
    rarity: 'common',
    riveIndex: 1,
    icon: '/skins/skin/skin1.png',
    priceFlies: 150,
  },
  {
    id: 'skin_blue',
    name: 'Blue',
    slot: 'skin',
    rarity: 'uncommon',
    riveIndex: 2,
    icon: '/skins/skin/skin2.png',
    priceFlies: 400,
  },
  {
    id: 'skin_red',
    name: 'Red',
    slot: 'skin',
    rarity: 'rare',
    riveIndex: 3,
    icon: '/skins/skin/skin3.png',
    priceFlies: 900,
  },
  {
    id: 'skin_santa',
    name: 'Santa',
    slot: 'skin',
    rarity: 'epic',
    riveIndex: 4,
    icon: '/skins/skin/skin4.png',
    priceFlies: 1800,
  },
  {
    id: 'skin_wizzard',
    name: 'Wizzard',
    slot: 'skin',
    rarity: 'legendary',
    riveIndex: 5,
    icon: '/skins/skin/skin5.png',
  },

  // Hats
  {
    id: 'hat_cap',
    name: 'Cap',
    slot: 'hat',
    rarity: 'common',
    riveIndex: 1,
    icon: '/skins/hat/hat1.png',
    priceFlies: 120,
  },
  {
    id: 'hat_crown',
    name: 'Crown',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 3,
    icon: '/skins/hat/hat2.png',
    priceFlies: 1500,
  },

  // Scarves
  {
    id: 'scarf_green',
    name: 'Green Scarf',
    slot: 'scarf',
    rarity: 'uncommon',
    riveIndex: 1,
    icon: '/skins/scarf/scarf1.png',
    priceFlies: 300,
  },

  // Hand items
  {
    id: 'hand_flower',
    name: 'Flower',
    slot: 'hand_item',
    rarity: 'rare',
    riveIndex: 2,
    icon: '/skins/hand/hand1.png',
    priceFlies: 700,
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
