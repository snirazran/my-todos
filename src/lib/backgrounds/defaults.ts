import BackgroundModel from '@/lib/models/Background';

export const DEFAULT_BACKGROUND_ID = 'bg_default';

export const DEFAULT_BACKGROUND_NAME = 'Swamp';

export async function ensureDefaultBackground() {
  const existing = await BackgroundModel.findOne({ id: DEFAULT_BACKGROUND_ID });
  if (existing) {
    if (existing.name !== DEFAULT_BACKGROUND_NAME) {
      existing.name = DEFAULT_BACKGROUND_NAME;
      await existing.save();
    }
    return existing;
  }
  return BackgroundModel.create({
    id: DEFAULT_BACKGROUND_ID,
    name: DEFAULT_BACKGROUND_NAME,
    rarity: 'common',
    priceFlies: 0,
    images: {
      mobile: '/bg-mobile.webp',
      tablet: '/bg-tablet.webp',
      web: '/bg-web.webp',
      webLarge: '/bg-web-large.webp',
    },
    hidden: false,
  });
}
