import BackgroundModel from '@/lib/models/Background';

export const DEFAULT_BACKGROUND_ID = 'bg_default';

export const DEFAULT_BACKGROUND_NAME = 'Swamp';

const DEFAULT_BACKGROUND_IMAGES = {
  mobile: '/bg-mobile.webp',
  tablet: '/bg-tablet.webp',
  web: '/bg-web.webp',
  webLarge: '/bg-web-large.webp',
};

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
