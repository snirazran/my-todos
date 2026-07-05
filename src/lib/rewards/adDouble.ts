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

export function recordDoubleableClaim(user: any, summary: DoubleableSummary) {
  const hasGrant =
    (summary.fliesGranted ?? 0) > 0 ||
    (summary.grantedItemIds?.length ?? 0) > 0 ||
    (summary.grantedBackgroundIds?.length ?? 0) > 0;
  if (!hasGrant) return;
  const isPremium = user.premiumUntil
    ? new Date(user.premiumUntil) > new Date()
    : false;
  if (isPremium) return;

  const claim: AdDoubleClaim = {
    id: randomUUID(),
    fliesGranted: summary.fliesGranted ?? 0,
    grantedItemIds: [...(summary.grantedItemIds ?? [])],
    grantedBackgroundIds: [...(summary.grantedBackgroundIds ?? [])],
    doubled: false,
    createdAt: new Date(),
  };
  user.adDoubleClaim = claim;
  user.markModified?.('adDoubleClaim');
  summary.doubleClaimId = claim.id;
}
