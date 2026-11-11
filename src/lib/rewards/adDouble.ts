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
