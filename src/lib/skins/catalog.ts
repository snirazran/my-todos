export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type WardrobeSlot = 'skin' | 'hat' | 'body' | 'hand_item' | 'container';

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

export const TRADE_ITEM_COUNT = 10;

export const rarityRank: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const CATALOG: Readonly<ItemDef[]> = [
  // --- SKINS (0=none, 1=pink, 2=blue, 3=rainbow) ---
  {
    id: 'skin_pink',
    name: 'Pink Frog',
    slot: 'skin',
    rarity: 'uncommon',
    riveIndex: 1,
    icon: '/skins/skin/skin1.png',
    priceFlies: 200,
  },
  {
    id: 'skin_blue',
    name: 'Blue Frog',
    slot: 'skin',
    rarity: 'rare',
    riveIndex: 2,
    icon: '/skins/skin/skin2.png',
    priceFlies: 500,
  },
  {
    id: 'skin_rainbow',
    name: 'Rainbow Frog',
    slot: 'skin',
    rarity: 'legendary',
    riveIndex: 3,
    icon: '/skins/skin/skin3.png',
    priceFlies: 2500,
  },

  // --- HATS (0=none, 1=wizard, 2=santa, 3=headphones, 4=pirate, 5=girl hair, 6=sailor, 7=beer, 8=toilet paper, 9=helicopter, 10=bee keeper) ---
  {
    id: 'hat_wizard',
    name: 'Wizard Hat',
    slot: 'hat',
    rarity: 'legendary',
    riveIndex: 1,
    icon: '/skins/hat/hat1.png',
    priceFlies: 2500,
  },
  {
    id: 'hat_santa',
    name: 'Santa Hat',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 2,
    icon: '/skins/hat/hat2.png',
    priceFlies: 1200,
  },
  {
    id: 'hat_headphones',
    name: 'Headphones',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 3,
    icon: '/skins/hat/hat3.png',
    priceFlies: 1400,
  },
  {
    id: 'hat_pirate',
    name: 'Pirate Hat',
    slot: 'hat',
    rarity: 'rare',
    riveIndex: 4,
    icon: '/skins/hat/hat4.png',
    priceFlies: 600,
  },
  {
    id: 'hat_girl_hair',
    name: 'Girl Hair',
    slot: 'hat',
    rarity: 'uncommon',
    riveIndex: 5,
    icon: '/skins/hat/hat5.png',
    priceFlies: 300,
  },
  {
    id: 'hat_sailor',
    name: 'Sailor Hat',
    slot: 'hat',
    rarity: 'uncommon',
    riveIndex: 6,
    icon: '/skins/hat/hat6.png',
    priceFlies: 300,
  },
  {
    id: 'hat_beer',
    name: 'Beer Hat',
    slot: 'hat',
    rarity: 'rare',
    riveIndex: 7,
    icon: '/skins/hat/hat7.png',
    priceFlies: 700,
  },
  {
    id: 'hat_toilet_paper',
    name: 'Toilet Paper',
    slot: 'hat',
    rarity: 'common',
    riveIndex: 8,
    icon: '/skins/hat/hat8.png',
    priceFlies: 100,
  },
  {
    id: 'hat_helicopter',
    name: 'Helicopter Hat',
    slot: 'hat',
    rarity: 'epic',
    riveIndex: 9,
    icon: '/skins/hat/hat9.png',
    priceFlies: 1500,
  },
  {
    id: 'hat_bee_keeper',
    name: 'Bee Keeper Hat',
    slot: 'hat',
    rarity: 'rare',
    riveIndex: 10,
    icon: '/skins/hat/hat10.png',
    priceFlies: 800,
  },

  // --- BODY (0=none, 1=sailor scarf, 2=red scarf, 3=blue scarf, 4=ghost custom, 5=ninja custom) ---
  {
    id: 'body_sailor_scarf',
    name: 'Sailor Scarf',
    slot: 'body',
    rarity: 'common',
    riveIndex: 1,
    icon: '/skins/body/body1.png',
    priceFlies: 50,
  },
  {
    id: 'body_red_scarf',
    name: 'Red Scarf',
    slot: 'body',
    rarity: 'common',
    riveIndex: 2,
    icon: '/skins/body/body2.png',
    priceFlies: 50,
  },
  {
    id: 'body_blue_scarf',
    name: 'Blue Scarf',
    slot: 'body',
    rarity: 'uncommon',
    riveIndex: 3,
    icon: '/skins/body/body3.png',
    priceFlies: 200,
  },
  {
    id: 'body_ghost',
    name: 'Ghost Costume',
    slot: 'body',
    rarity: 'epic',
    riveIndex: 4,
    icon: '/skins/body/body4.png',
    priceFlies: 1200,
  },
  {
    id: 'body_ninja',
    name: 'Ninja Costume',
    slot: 'body',
    rarity: 'legendary',
    riveIndex: 5,
    icon: '/skins/body/body5.png',
    priceFlies: 2500,
  },

  // --- HAND ITEMS (0=none, 1=wizard wand, 2=controller, 3=pirate sword, 4=phone, 5=shuriken) ---
  {
    id: 'hand_wand',
    name: 'Wizard Wand',
    slot: 'hand_item',
    rarity: 'legendary',
    riveIndex: 1,
    icon: '/skins/hand/hand1.png',
    priceFlies: 2800,
  },
  {
    id: 'hand_controller',
    name: 'Controller',
    slot: 'hand_item',
    rarity: 'epic',
    riveIndex: 2,
    icon: '/skins/hand/hand2.png',
    priceFlies: 1500,
  },
  {
    id: 'hand_sword',
    name: 'Pirate Sword',
    slot: 'hand_item',
    rarity: 'rare',
    riveIndex: 3,
    icon: '/skins/hand/hand3.png',
    priceFlies: 650,
  },
  {
    id: 'hand_phone',
    name: 'Phone',
    slot: 'hand_item',
    rarity: 'uncommon',
    riveIndex: 4,
    icon: '/skins/hand/hand4.png',
    priceFlies: 300,
  },
  {
    id: 'hand_shuriken',
    name: 'Shuriken',
    slot: 'hand_item',
    rarity: 'epic',
    riveIndex: 5,
    icon: '/skins/hand/hand5.png',
    priceFlies: 1500,
  },

  // --- CONTAINERS ---
  {
    id: 'gift_box_1',
    name: 'Common Gift',
    slot: 'container',
    rarity: 'common',
    riveIndex: 0,
    icon: '/skins/container/gift.png',
    priceFlies: 100,
  },
  {
    id: 'gift_box_rare',
    name: 'Rare Gift',
    slot: 'container',
    rarity: 'rare',
    riveIndex: 1,
    icon: '/skins/container/gift.png',
    priceFlies: 500,
  },
  {
    id: 'gift_box_legendary',
    name: 'Legendary Gift',
    slot: 'container',
    rarity: 'legendary',
    riveIndex: 2,
    icon: '/skins/container/gift.png',
    priceFlies: 2500,
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
