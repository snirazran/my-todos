import { ItemDef, Rarity } from '@/lib/skins/catalog';

export const rollRarity = (weights: Record<Rarity, number>): Rarity => {
  const rand = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (rand < cumulative) return rarity as Rarity;
  }
  return 'common';
};

export const getRandomItem = (
  weights: Record<Rarity, number>,
  catalog: Record<Rarity, ItemDef[]>
): ItemDef => {
  let rarity = rollRarity(weights);
  while (catalog[rarity].length === 0) {
    if (rarity === 'legendary') rarity = 'epic';
    else if (rarity === 'epic') rarity = 'rare';
    else if (rarity === 'rare') rarity = 'uncommon';
    else if (rarity === 'uncommon') rarity = 'common';
    else break;
  }
  const pool = catalog[rarity];
  return pool[Math.floor(Math.random() * pool.length)];
};
