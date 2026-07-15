const STALE_AFTER_DAYS = 3;
const STALE_CAP_DAYS = 7;
const URGENT_WITHIN_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const PRIORITY_WEIGHTS = {
  proximity: 0.5,
  staleness: 0.3,
  urgency: 0.2,
} as const;

export type PriorityReason = 'expiring' | 'neglected' | 'almost-there' | null;

export type PriorityInput = {
  placement: 'daily' | 'category' | 'onboarding';
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  lastProgressAt?: string;
  expiresAt?: string;
};

export type PriorityOptions = {
  typicalHoursUntilReset?: number | null;
};

export type PriorityResult = {
  score: number;
  reason: PriorityReason;
  staleDays: number;
  hoursUntilReset: number | null;
  proximity: number;
  staleness: number;
  urgency: number;
};

export function scoreQuestPriority(
  input: PriorityInput,
  now: number = Date.now(),
  options?: PriorityOptions,
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
      const typical = options?.typicalHoursUntilReset ?? null;
      const soonerThanPool =
        typical === null || hoursUntilReset <= typical * 0.5;
      if (hoursUntilReset <= URGENT_WITHIN_HOURS && soonerThanPool) {
        urgency = 1 - hoursUntilReset / URGENT_WITHIN_HOURS;
      }
    }
  }

  const score =
    PRIORITY_WEIGHTS.proximity * proximity +
    PRIORITY_WEIGHTS.staleness * staleness +
    PRIORITY_WEIGHTS.urgency * urgency;

  let reason: PriorityReason = null;
  if (urgency > 0 && proximity < 1) {
    reason = 'expiring';
  } else if (staleDays >= STALE_AFTER_DAYS) {
    reason = 'neglected';
  } else if (proximity >= 0.6) {
    reason = 'almost-there';
  }

  return { score, reason, staleDays, hoursUntilReset, proximity, staleness, urgency };
}

function quantizeScore(score: number): number {
  return Math.round(score * 100);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function compareQuestPriority(
  a: { input: PriorityInput; result: PriorityResult },
  b: { input: PriorityInput; result: PriorityResult },
): number {
  return (
    Number(a.input.needsFocusTags ?? false) -
      Number(b.input.needsFocusTags ?? false) ||
    Number(b.input.placement === 'onboarding') -
      Number(a.input.placement === 'onboarding') ||
    quantizeScore(b.result.score) - quantizeScore(a.result.score) ||
    (a.input.tierIndex ?? 0) - (b.input.tierIndex ?? 0) ||
    Math.max(1, a.input.target) -
      a.input.progress -
      (Math.max(1, b.input.target) - b.input.progress) ||
    (a.result.hoursUntilReset ?? Number.MAX_VALUE) -
      (b.result.hoursUntilReset ?? Number.MAX_VALUE)
  );
}

export function rankByQuestPriority<T extends PriorityInput>(
  items: T[],
  now: number = Date.now(),
): { item: T; result: PriorityResult }[] {
  const horizons = items
    .map((item) => (item.expiresAt ? Date.parse(item.expiresAt) : NaN))
    .filter((at) => Number.isFinite(at))
    .map((at) => Math.max(0, (at - now) / HOUR_MS));
  const typicalHoursUntilReset =
    horizons.length >= 2 ? median(horizons) : null;
  return items
    .map((item) => ({
      item,
      result: scoreQuestPriority(item, now, { typicalHoursUntilReset }),
    }))
    .sort((a, b) =>
      compareQuestPriority(
        { input: a.item, result: a.result },
        { input: b.item, result: b.result },
      ),
    );
}

export function resetCountdownLabel(
  hoursUntilReset: number | null,
): string | null {
  if (hoursUntilReset === null) return null;
  if (hoursUntilReset < 1) return 'Resets soon';
  if (hoursUntilReset < 24) {
    return `Resets in ${Math.max(1, Math.round(hoursUntilReset))}h`;
  }
  return `Resets in ${Math.round(hoursUntilReset / 24)}d`;
}

export function priorityReasonLabel(result: PriorityResult): string | null {
  if (result.reason === 'expiring') {
    return resetCountdownLabel(result.hoursUntilReset);
  }
  if (result.reason === 'neglected') {
    return `Quiet for ${result.staleDays} days`;
  }
  if (result.reason === 'almost-there') {
    return 'Almost there!';
  }
  return null;
}
