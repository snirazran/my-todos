import type { PlusSubscriptionSnapshot } from '@/lib/revenuecat';

export const TRIAL_ENDING_LEAD_MS = 24 * 60 * 60 * 1000;
const TRIAL_ENDING_SETTLE_MS = 12 * 60 * 60 * 1000;

export function trialEndingAt(
  sub: PlusSubscriptionSnapshot | null | undefined,
  now = Date.now(),
): string | null {
  if (!sub || sub.periodType !== 'trial' || sub.willRenew || !sub.expiresAt) {
    return null;
  }
  const left = new Date(sub.expiresAt).getTime() - now;
  if (!(left > 0 && left <= TRIAL_ENDING_LEAD_MS)) return null;
  if (
    sub.cancelledAt &&
    now - new Date(sub.cancelledAt).getTime() < TRIAL_ENDING_SETTLE_MS
  ) {
    return null;
  }
  return sub.expiresAt;
}
