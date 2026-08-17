import connectMongo from '@/lib/mongoose';
import FlyLedgerModel from '@/lib/models/FlyLedger';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { loadFlyEconomyConfig } from './config';

export const FLY_SOURCES = [
  'task',
  'task_streak',
  'buddy',
  'friend_pond',
  'friend_pond_double',
  'focus',
  'deep_focus',
  'quest',
  'season',
  'daily_reward',
  'login_streak',
  'pact',
  'invite',
  'rewarded_ad',
  'fly_game',
  'cross_gift',
  'campaign',
  'admin',
  'purchase',
  'spend',
  'other',
] as const;

export type FlySource = (typeof FLY_SOURCES)[number];

export type FlySettlement = {
  /** Flies the caller must add to (or, when negative, remove from) the balance. */
  delta: number;
  paidBefore: number;
  paidAfter: number;
  /** True when a cap or the circuit breaker cut the payout short. */
  capped: boolean;
  /** True when the global per-day breaker was the thing that cut it. */
  breakerTripped: boolean;
};

const EMPTY: FlySettlement = {
  delta: 0,
  paidBefore: 0,
  paidAfter: 0,
  capped: false,
  breakerTripped: false,
};

/** Positive flies this user has been granted on a user-local day, all sources. */
export async function fliesGrantedOnDay(
  userId: string,
  dayKey: string,
  sources?: FlySource[],
): Promise<number> {
  await connectMongo();
  const match: Record<string, unknown> = {
    userId,
    dayKey,
    amount: { $gt: 0 },
  };
  if (sources?.length) match.source = { $in: sources };
  const [row] = await FlyLedgerModel.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

/** Same, narrowed to rows whose meta matches — a single bond, a single friend. */
export async function fliesGrantedOnDayWhere(
  userId: string,
  dayKey: string,
  source: FlySource,
  meta: Record<string, string | number | boolean>,
): Promise<number> {
  await connectMongo();
  const match: Record<string, unknown> = {
    userId,
    dayKey,
    source,
    amount: { $gt: 0 },
  };
  Object.entries(meta).forEach(([key, value]) => {
    match[`meta.${key}`] = value;
  });
  const [row] = await FlyLedgerModel.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

/** How many distinct occurrences of a source paid out on a day. */
export async function paidOccurrencesOnDay(
  userId: string,
  dayKey: string,
  source: FlySource,
): Promise<number> {
  await connectMongo();
  return FlyLedgerModel.countDocuments({
    userId,
    dayKey,
    source,
    amount: { $gt: 0 },
  });
}

export async function fliesGrantedInRange(
  userId: string,
  fromDayKey: string,
  toDayKey: string,
  source: FlySource,
): Promise<number> {
  await connectMongo();
  const [row] = await FlyLedgerModel.aggregate<{ total: number }>([
    {
      $match: {
        userId,
        source,
        amount: { $gt: 0 },
        dayKey: { $gte: fromDayKey, $lte: toDayKey },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

async function breakerHeadroom(userId: string, dayKey: string) {
  const config = await loadFlyEconomyConfig();
  const spentToday = await fliesGrantedOnDay(userId, dayKey);
  return Math.max(0, config.circuitBreaker.dailyCap - spentToday);
}

/**
 * Pay an occurrence up to `targetAmount` — total, not additional. The ledger row
 * holds what that occurrence has already paid, so re-completing after an undo
 * settles back to the same number instead of paying twice, and a retried request
 * moves nothing at all. Returns the delta the caller applies to the balance.
 */
export async function settleFlyGrant(args: {
  userId: string;
  source: FlySource;
  occurrenceKey: string;
  dayKey: string;
  targetAmount: number;
  /** Flies this source may still pay today, on top of what this row already paid. */
  capRemaining?: number;
  /** Skip the global per-day breaker (refunds and corrections only). */
  skipBreaker?: boolean;
  meta?: Record<string, unknown>;
}): Promise<FlySettlement> {
  const {
    userId,
    source,
    occurrenceKey,
    dayKey,
    capRemaining,
    skipBreaker,
    meta,
  } = args;
  if (!userId || !occurrenceKey) return EMPTY;

  await connectMongo();
  const filter = { userId, source, occurrenceKey };

  const before = await FlyLedgerModel.findOneAndUpdate(
    filter,
    { $setOnInsert: { amount: 0, dayKey, meta: meta ?? {}, movements: [] } },
    { upsert: true, new: false },
  ).lean<{ amount?: number } | null>();

  const paidBefore = Math.max(0, before?.amount ?? 0);
  let target = Math.max(0, Math.floor(args.targetAmount));
  let capped = false;
  let breakerTripped = false;

  if (typeof capRemaining === 'number') {
    const ceiling = paidBefore + Math.max(0, capRemaining);
    if (target > ceiling) {
      target = ceiling;
      capped = true;
    }
  }

  if (!skipBreaker && target > paidBefore) {
    const headroom = await breakerHeadroom(userId, dayKey);
    const ceiling = paidBefore + headroom;
    if (target > ceiling) {
      target = ceiling;
      capped = true;
      breakerTripped = true;
    }
  }

  const delta = target - paidBefore;
  if (delta === 0) {
    return { delta: 0, paidBefore, paidAfter: paidBefore, capped, breakerTripped };
  }

  const applied = await FlyLedgerModel.updateOne(
    { ...filter, amount: paidBefore },
    {
      $inc: { amount: delta },
      $set: { dayKey, ...(meta ? { meta } : {}) },
      $push: {
        movements: {
          $each: [{ at: new Date(), delta }],
          $slice: -25,
        },
      },
    },
  );

  // A concurrent settlement already moved this occurrence. Its write is as
  // authoritative as ours, so we pay nothing rather than pay it twice.
  if (applied.modifiedCount === 0) {
    return { delta: 0, paidBefore, paidAfter: paidBefore, capped, breakerTripped };
  }

  if (breakerTripped) {
    console.warn('[fly-economy] circuit breaker tripped', {
      userId,
      source,
      occurrenceKey,
      dayKey,
      requested: Math.floor(args.targetAmount),
      granted: target,
    });
    void recordAnalyticsEvent({
      userId,
      name: 'fly_circuit_breaker',
      properties: {
        source,
        day_key: dayKey,
        requested: Math.floor(args.targetAmount),
        granted: target,
      },
    }).catch(() => {});
  }

  return { delta, paidBefore, paidAfter: target, capped, breakerTripped };
}

/**
 * Record a grant a caller has already decided on — one-shot claims that carry
 * their own idempotency (a claimed quest, a settled pact week). The row exists
 * for tuning, so the amount is written as given rather than clamped; if the day
 * crosses the breaker the trip is reported for investigation instead of
 * silently rewriting a claim the user has already been shown.
 */
export async function logFlyGrant(args: {
  userId: string;
  source: FlySource;
  occurrenceKey: string;
  dayKey: string;
  amount: number;
  balanceAfter?: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const amount = Math.floor(args.amount);
  if (!args.userId || !args.occurrenceKey || !amount) return;
  try {
    await connectMongo();
    await FlyLedgerModel.updateOne(
      {
        userId: args.userId,
        source: args.source,
        occurrenceKey: args.occurrenceKey,
      },
      {
        $inc: { amount },
        $set: { dayKey: args.dayKey, ...(args.meta ? { meta: args.meta } : {}) },
        $push: {
          movements: {
            $each: [
              { at: new Date(), delta: amount, balanceAfter: args.balanceAfter },
            ],
            $slice: -25,
          },
        },
      },
      { upsert: true },
    );

    if (amount > 0) {
      const config = await loadFlyEconomyConfig();
      const total = await fliesGrantedOnDay(args.userId, args.dayKey);
      if (total > config.circuitBreaker.dailyCap) {
        console.warn('[fly-economy] circuit breaker exceeded', {
          userId: args.userId,
          source: args.source,
          dayKey: args.dayKey,
          total,
        });
        void recordAnalyticsEvent({
          userId: args.userId,
          name: 'fly_circuit_breaker',
          properties: {
            source: args.source,
            day_key: args.dayKey,
            granted: total,
          },
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('[fly-economy] grant log failed:', error);
  }
}

/** Log a spend. Idempotent on (user, source, key); never blocks the spend. */
export async function recordFlySpend(args: {
  userId: string;
  source: FlySource;
  occurrenceKey: string;
  dayKey: string;
  amount: number;
  balanceAfter?: number;
  meta?: Record<string, unknown>;
}): Promise<{ recorded: boolean }> {
  const amount = Math.abs(Math.floor(args.amount));
  if (!args.userId || !args.occurrenceKey || amount === 0) {
    return { recorded: false };
  }
  try {
    await connectMongo();
    await FlyLedgerModel.create({
      userId: args.userId,
      source: args.source,
      occurrenceKey: args.occurrenceKey,
      dayKey: args.dayKey,
      amount: -amount,
      meta: args.meta,
      movements: [
        { at: new Date(), delta: -amount, balanceAfter: args.balanceAfter },
      ],
    });
    return { recorded: true };
  } catch (error: any) {
    if (error?.code === 11000) return { recorded: false };
    console.error('[fly-economy] spend log failed:', error);
    return { recorded: false };
  }
}

/**
 * Grant flies that have no natural occurrence of their own (an ad view, a
 * one-off gift). The caller supplies a key that is unique per event.
 */
export async function recordFlyGrant(args: {
  userId: string;
  source: FlySource;
  occurrenceKey: string;
  dayKey: string;
  amount: number;
  capRemaining?: number;
  meta?: Record<string, unknown>;
}): Promise<FlySettlement> {
  return settleFlyGrant({ ...args, targetAmount: args.amount });
}
