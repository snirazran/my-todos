const STALE_AFTER_DAYS = 3;
const STALE_CAP_DAYS = 7;
const URGENT_WITHIN_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type PriorityReason = 'expiring' | 'neglected' | 'almost-there' | null;

export type PriorityInput = {
  placement: 'daily' | 'category' | 'onboarding';
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  lastProgressAt?: string;
  expiresAt?: string;
};

export type PriorityResult = {
  score: number;
  reason: PriorityReason;
  staleDays: number;
  hoursUntilReset: number | null;
  proximity: number;
};

export function scoreQuestPriority(
  input: PriorityInput,
  now: number = Date.now(),
): PriorityResult {
  const target = Math.max(1, input.target);
  const proximity = Math.min(1, Math.max(0, input.progress) / target);

  let staleDays = 0;
  if (input.placement === 'category' && input.lastProgressAt) {
    const at = Date.parse(input.lastProgressAt);
    if (Number.isFinite(at) && at < now) {
      staleDays = Math.floor((now - at) / DAY_MS);
    }
  }
  const staleness = Math.min(1, staleDays / STALE_CAP_DAYS);

  let hoursUntilReset: number | null = null;
  let urgency = 0;
  if (input.expiresAt) {
    const at = Date.parse(input.expiresAt);
    if (Number.isFinite(at)) {
      hoursUntilReset = Math.max(0, (at - now) / HOUR_MS);
      if (hoursUntilReset <= URGENT_WITHIN_HOURS) {
        urgency = 1 - hoursUntilReset / URGENT_WITHIN_HOURS;
      }
    }
  }

  const score = 0.5 * proximity + 0.3 * staleness + 0.2 * urgency;

  let reason: PriorityReason = null;
  if (urgency > 0 && proximity < 1) {
    reason = 'expiring';
  } else if (staleDays >= STALE_AFTER_DAYS) {
    reason = 'neglected';
  } else if (proximity >= 0.6) {
    reason = 'almost-there';
  }

  return { score, reason, staleDays, hoursUntilReset, proximity };
}

export function compareQuestPriority(
  a: { input: PriorityInput; result: PriorityResult },
  b: { input: PriorityInput; result: PriorityResult },
): number {
  return (
    Number(b.input.placement === 'onboarding') -
      Number(a.input.placement === 'onboarding') ||
    Number(a.input.needsFocusTags ?? false) -
      Number(b.input.needsFocusTags ?? false) ||
    b.result.score - a.result.score ||
    Math.max(1, a.input.target) -
      a.input.progress -
      (Math.max(1, b.input.target) - b.input.progress)
  );
}

export function rankByQuestPriority<T extends PriorityInput>(
  items: T[],
  now: number = Date.now(),
): { item: T; result: PriorityResult }[] {
  return items
    .map((item) => ({ item, result: scoreQuestPriority(item, now) }))
    .sort((a, b) =>
      compareQuestPriority(
        { input: a.item, result: a.result },
        { input: b.item, result: b.result },
      ),
    );
}

export function priorityReasonLabel(result: PriorityResult): string | null {
  if (result.reason === 'expiring') {
    if (result.hoursUntilReset === null) return null;
    if (result.hoursUntilReset < 1) return 'Resets soon';
    if (result.hoursUntilReset < 24) {
      return `Resets in ${Math.max(1, Math.round(result.hoursUntilReset))}h`;
    }
    return `Resets in ${Math.round(result.hoursUntilReset / 24)}d`;
  }
  if (result.reason === 'neglected') {
    return `Quiet for ${result.staleDays} days`;
  }
  if (result.reason === 'almost-there') {
    return 'Almost there!';
  }
  return null;
}
