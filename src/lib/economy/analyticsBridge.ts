import { getZonedToday } from '@/lib/utils';
import { storedEconomyTimezone } from './guards';
import { logFlyGrant, type FlySource } from './ledger';

/**
 * Faucets that settle their own ledger rows before touching a balance. Their
 * `fly_earned` events are a report of a row that already exists, so the bridge
 * stays out of the way rather than counting the same flies twice.
 */
const ALREADY_LEDGERED = new Set([
  'task',
  'buddy_task',
  'rewarded_ad',
  'friend_activity',
  'friend_reward_double',
  'invite_tier',
]);

/**
 * Everything else — quest and season claims, daily rewards, login streaks, pact
 * settlements, the fly game — is a one-shot claim with its own idempotency. It
 * gets a per-day rollup row so daily totals, the circuit breaker and six weeks
 * of tuning data see the whole faucet, not just the parts with occurrences.
 */
const SOURCE_MAP: Record<string, FlySource> = {
  focus_session: 'focus',
  deep_focus: 'deep_focus',
  quest_objective: 'quest',
  quest_reward: 'quest',
  quest_streak: 'quest',
  move_to_web: 'quest',
  season_reward: 'season',
  daily_reward: 'daily_reward',
  login_streak: 'login_streak',
  streak_check_in: 'login_streak',
  pact: 'pact',
  pact_retro: 'pact',
  fly_game: 'fly_game',
  cross_gift: 'cross_gift',
  campaign: 'campaign',
  purchase: 'purchase',
  rewarded_ad_double: 'rewarded_ad',
  hunger_recover: 'other',
};

export function ledgerSourceFor(source: unknown): FlySource | null {
  if (typeof source !== 'string') return 'other';
  if (ALREADY_LEDGERED.has(source)) return null;
  return SOURCE_MAP[source] ?? 'other';
}

export async function bridgeFlyEarnedToLedger(input: {
  userId: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  const rawSource = input.properties?.source;
  const source = ledgerSourceFor(rawSource);
  if (!source) return;

  const amount = Number(input.properties?.fly_amount);
  if (!Number.isFinite(amount) || amount === 0) return;

  const dayKey = getZonedToday(await storedEconomyTimezone(input.userId));
  await logFlyGrant({
    userId: input.userId,
    source,
    occurrenceKey: `rollup:${String(rawSource ?? 'other')}:${dayKey}`,
    dayKey,
    amount,
    meta: { rollup: true, reported: String(rawSource ?? 'other') },
  });
}

/** Spends never gate anything; the row exists so the sinks can be tuned too. */
export async function bridgeFlySpentToLedger(input: {
  userId: string;
  properties?: Record<string, unknown>;
}) {
  const rawSource = String(input.properties?.source ?? 'spend');
  const amount = Number(
    input.properties?.fly_amount ?? input.properties?.flies_spent,
  );
  if (!Number.isFinite(amount) || amount <= 0) return;

  const dayKey = getZonedToday(await storedEconomyTimezone(input.userId));
  await logFlyGrant({
    userId: input.userId,
    source: 'spend',
    occurrenceKey: `rollup:spend:${rawSource}:${dayKey}`,
    dayKey,
    amount: -Math.abs(amount),
    meta: { rollup: true, reported: rawSource },
  });
}
