import { randomUUID } from 'crypto';

export type DoubleableSummary = {
  fliesGranted: number;
  flyBalanceBefore?: number;
  flyBalanceAfter?: number;
  grantedItemIds: string[];
  grantedBackgroundIds?: string[];
  doubleClaimId?: string;
};

export type AdDoubleClaim = {
  id: string;
  fliesGranted: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  doubled: boolean;
  createdAt: Date;
};

export const DOUBLE_CLAIM_WINDOW_MS = 15 * 60 * 1000;

/**
 * The ad-funded half of the one doubling rule: a free player watching one
 * rewarded ad gets exactly what Plus gets automatically, which is flies ×2 and
 * nothing else. A gift is doubled where it is opened — two prizes out of the
 * one box (see /api/skins/open-gift/double) — so an item or a background that
 * came with the claim is never re-granted here; a duplicate skin is not a
 * second reward. Sources the doc marks "never doubled" must not call this at
 * all, or the ad would hand out what a subscription deliberately does not.
 */
export function recordDoubleableClaim(user: any, summary: DoubleableSummary) {
  if ((summary.fliesGranted ?? 0) <= 0) return;
  const isPremium = user.premiumUntil
    ? new Date(user.premiumUntil) > new Date()
    : false;
  if (isPremium) return;

  const claim: AdDoubleClaim = {
    id: randomUUID(),
    fliesGranted: summary.fliesGranted ?? 0,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    doubled: false,
    createdAt: new Date(),
  };
  user.adDoubleClaim = claim;
  user.markModified?.('adDoubleClaim');
  summary.doubleClaimId = claim.id;
}
