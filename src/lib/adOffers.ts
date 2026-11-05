export type AdOfferSurface =
  | 'questDouble'
  | 'giftDouble'
  | 'streakRescue'
  | 'streakDouble'
  | 'friendsDouble';
export type AdOfferMode = 'ad' | 'plus';
export type AdOffers = Record<AdOfferSurface, AdOfferMode>;

const PLACEMENT_SURFACE: Record<string, AdOfferSurface> = {
  quest_reward_double: 'questDouble',
  gift_double: 'giftDouble',
  streak_rescue: 'streakRescue',
  streak_commitment_double: 'streakDouble',
  friend_reward_double: 'friendsDouble',
};

export function adOfferSurface(placement: string): AdOfferSurface | null {
  return PLACEMENT_SURFACE[placement] ?? null;
}

export function adOffersFrom(rewardedAds: {
  questDoublePlus: boolean;
  giftDoublePlus: boolean;
  streakRescuePlus: boolean;
  streakDoublePlus: boolean;
  friendsDoublePlus: boolean;
}): AdOffers {
  const mode = (plus: boolean): AdOfferMode => (plus ? 'plus' : 'ad');
  return {
    questDouble: mode(rewardedAds.questDoublePlus),
    giftDouble: mode(rewardedAds.giftDoublePlus),
    streakRescue: mode(rewardedAds.streakRescuePlus),
    streakDouble: mode(rewardedAds.streakDoublePlus),
    friendsDouble: mode(rewardedAds.friendsDoublePlus),
  };
}
