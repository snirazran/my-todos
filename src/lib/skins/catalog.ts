// lib/skins/catalog.ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type SkinDef = {
  id: string; // stable id stored in DB
  name: string;
  rarity: Rarity;
  riveIndex: number; // value for the Rive "skin" input
  icon: string; // path under /public
  priceFlies?: number; // (for the shop later)
};

export const RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const satisfies Readonly<Rarity[]>;

export const rarityRank: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const nextRarity = (r: Rarity): Rarity =>
  RARITY_ORDER[Math.min(rarityRank[r] + 1, RARITY_ORDER.length - 1)];

export const CATALOG: Readonly<SkinDef[]> = [
  {
    id: 'green',
    name: 'Green',
    rarity: 'common',
    riveIndex: 0,
    icon: '/skins/common/skin0.png',
    priceFlies: 0, // starter
  },
  {
    id: 'pink',
    name: 'Pink',
    rarity: 'uncommon',
    riveIndex: 1,
    icon: '/skins/uncommon/skin1.png',
    priceFlies: 150,
  },
  {
    id: 'blue',
    name: 'Blue',
    rarity: 'rare',
    riveIndex: 2,
    icon: '/skins/rare/skin2.png',
    priceFlies: 400,
  },
  {
    id: 'red',
    name: 'Red',
    rarity: 'epic',
    riveIndex: 3,
    icon: '/skins/epic/skin3.png',
    priceFlies: 900,
  },
  {
    id: 'santa',
    name: 'Santa',
    rarity: 'legendary',
    riveIndex: 4,
    icon: '/skins/legendary/skin4.png',
    priceFlies: 1800,
  },
  // If you later add "wizzard", add a unique riveIndex and a real icon path:
  {
    id: 'wizzard',
    name: 'Wizzard',
    rarity: 'legendary',
    riveIndex: 5,
    icon: '/skins/legendary/skin5.png',
  },
];

export const byId: Readonly<Record<string, SkinDef>> = Object.freeze(
  Object.fromEntries(CATALOG.map((s) => [s.id, s]))
);

// Helper for sorting an array of SkinDef (or user-owned ids) by rarity
export const sortByRarity = <T extends SkinDef>(arr: T[]) =>
  [...arr].sort(
    (a, b) =>
      rarityRank[a.rarity] - rarityRank[b.rarity] || a.riveIndex - b.riveIndex
  );
