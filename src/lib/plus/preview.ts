const DAY_MS = 86_400_000;

export const PLUS_PREVIEW_DAYS = 3;
export const PLUS_PREVIEW_MIN_ACCOUNT_AGE_MS = 2 * DAY_MS;
export const PLUS_PREVIEW_OFFER_MS = 2 * DAY_MS;
export const PLUS_PREVIEW_ENDING_LEAD_MS = DAY_MS;

export type PlusPreviewPhase =
  | 'none'
  | 'eligible'
  | 'active'
  | 'ended'
  | 'offer'
  | 'closed';

export type PlusPreviewState = {
  phase: PlusPreviewPhase;
  startedAt: string | null;
  endsAt: string | null;
  offerUntil: string | null;
  offer: boolean;
};

export type PlusPreviewRecord = {
  startedAt: string;
  endsAt: string;
  endSeenAt: string | null;
  offerUntil: string | null;
  endingPushAt: string | null;
};

type PreviewUser = {
  createdAt?: Date | string | null;
  onboardingCompleted?: boolean | null;
  premiumUntil?: Date | string | null;
  plusSubscription?: unknown;
  plusPreview?: unknown;
};

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function readPlusPreview(raw: unknown): PlusPreviewRecord | null {
  const value = (raw ?? null) as Record<string, unknown> | null;
  const startedAt = iso(value?.startedAt);
  const endsAt = iso(value?.endsAt);
  if (!startedAt || !endsAt) return null;
  return {
    startedAt,
    endsAt,
    endSeenAt: iso(value?.endSeenAt),
    offerUntil: iso(value?.offerUntil),
    endingPushAt: iso(value?.endingPushAt),
  };
}

function hasStorePlus(raw: unknown, now: number) {
  const sub = (raw ?? null) as { store?: string; expiresAt?: string | null } | null;
  if (!sub || sub.store === 'promotional' || !sub.expiresAt) return false;
  return new Date(sub.expiresAt).getTime() > now;
}

const EMPTY: PlusPreviewState = {
  phase: 'none',
  startedAt: null,
  endsAt: null,
  offerUntil: null,
  offer: false,
};

export function plusPreviewState(
  user: PreviewUser | null | undefined,
  now = Date.now(),
): PlusPreviewState {
  if (!user) return EMPTY;
  const record = readPlusPreview(user.plusPreview);
  if (!record) {
    const created = user.createdAt ? new Date(user.createdAt).getTime() : NaN;
    const eligible =
      !!user.onboardingCompleted &&
      !user.premiumUntil &&
      !user.plusSubscription &&
      Number.isFinite(created) &&
      now - created >= PLUS_PREVIEW_MIN_ACCOUNT_AGE_MS;
    return eligible ? { ...EMPTY, phase: 'eligible' } : EMPTY;
  }
  const base = { startedAt: record.startedAt, endsAt: record.endsAt };
  if (hasStorePlus(user.plusSubscription, now)) {
    return { ...base, phase: 'closed', offerUntil: null, offer: false };
  }
  if (now < new Date(record.endsAt).getTime()) {
    return { ...base, phase: 'active', offerUntil: null, offer: true };
  }
  if (!record.endSeenAt) {
    return { ...base, phase: 'ended', offerUntil: null, offer: true };
  }
  const open = !!record.offerUntil && now < new Date(record.offerUntil).getTime();
  return {
    ...base,
    phase: open ? 'offer' : 'closed',
    offerUntil: open ? record.offerUntil : null,
    offer: open,
  };
}

export function previewDaysLeft(endsAt: string | null | undefined, now = Date.now()) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS));
}

export function previewEndPush(when: 'today' | 'tomorrow') {
  return {
    title: `Your Plus preview ends ${when}`,
    body: 'Double rewards and the Plus shop switch off by themselves. Nothing to cancel. Tap to see your welcome price.',
  };
}
