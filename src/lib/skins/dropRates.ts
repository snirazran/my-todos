import type { Rarity } from './catalog';

/** Drop-rate tables per container rarity tier
 *
 * Common Gift:  legendary 1 in 500,000
 * Rare Gift:    legendary 1 in 1,000
 * Legendary Gift: legendary 1 in 10
 */
export const DROP_RATES: Record<string, Record<Rarity, number>> = {
  common: {
    common: 0.9,
    uncommon: 0.095,
    rare: 0.0049,
    epic: 0.0001,
    legendary: 0.000002,     // 1 in 500,000
  },
  rare: {
    common: 0.45,
    uncommon: 0.35,
    rare: 0.15,
    epic: 0.049,
    legendary: 0.001,        // 1 in 1,000
  },
  legendary: {
    common: 0.05,
    uncommon: 0.15,
    rare: 0.35,
    epic: 0.35,
    legendary: 0.1,          // 1 in 10
  },
};
