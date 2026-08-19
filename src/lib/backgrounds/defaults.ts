import BackgroundModel from '@/lib/models/Background';
import {
  BACKGROUND_SIZE_KEYS,
  DEFAULT_BACKGROUND_ID,
  DEFAULT_BACKGROUND_IMAGES,
  DEFAULT_BACKGROUND_NAME,
  isLegacyLocalBackground,
  stripQuery,
} from './constants';

export { DEFAULT_BACKGROUND_ID, DEFAULT_BACKGROUND_NAME };

export async function ensureDefaultBackground() {
  const existing = await BackgroundModel.findOne({ id: DEFAULT_BACKGROUND_ID });
  if (existing) {
    let changed = false;
    if (existing.name !== DEFAULT_BACKGROUND_NAME) {
      existing.name = DEFAULT_BACKGROUND_NAME;
      changed = true;
    }
    const images = existing.images ?? {};
    for (const size of BACKGROUND_SIZE_KEYS) {
      const current = typeof images[size] === 'string' ? images[size].trim() : '';
      const canonical = DEFAULT_BACKGROUND_IMAGES[size];
      if (current === canonical) continue;
      const servedHere = stripQuery(current) === canonical;
      if (current && !isLegacyLocalBackground(current) && !servedHere) continue;
      existing.set(`images.${size}`, canonical);
      changed = true;
    }
    if (changed) await existing.save();
    return existing;
  }
  return BackgroundModel.create({
    id: DEFAULT_BACKGROUND_ID,
    name: DEFAULT_BACKGROUND_NAME,
    rarity: 'common',
    priceFlies: 0,
    images: DEFAULT_BACKGROUND_IMAGES,
    hidden: false,
  });
}
