export type CrossGiftPlatform = 'web' | 'native';

export const FUNNEL_GIFT_ITEM_ID = 'skin_rainbow';
export const CROSS_GIFT_FLIES = 100;

export type CrossGiftStatus = {
  platform: CrossGiftPlatform;
  claimable: boolean;
  claimed: boolean;
  otherPlatformSeen: boolean;
  firstSeen?: boolean;
  flies: number;
};

export function otherPlatform(platform: CrossGiftPlatform): CrossGiftPlatform {
  return platform === 'web' ? 'native' : 'web';
}
