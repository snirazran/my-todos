import BackgroundModel from '@/lib/models/Background';
import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_BACKGROUND_IMAGES,
  DEFAULT_BACKGROUND_NAME,
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
    if (
      images.mobile !== DEFAULT_BACKGROUND_IMAGES.mobile ||
      images.tablet !== DEFAULT_BACKGROUND_IMAGES.tablet ||
      images.web !== DEFAULT_BACKGROUND_IMAGES.web ||
      images.webLarge !== DEFAULT_BACKGROUND_IMAGES.webLarge
    ) {
      existing.images = DEFAULT_BACKGROUND_IMAGES;
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
