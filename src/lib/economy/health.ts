import connectMongo from '@/lib/mongoose';
import FlyLedgerModel from '@/lib/models/FlyLedger';
import UserModel from '@/lib/models/User';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import { CATALOG, rarityRank } from '@/lib/skins/catalog';
import { daysAgoKey } from './guards';
import { getZonedToday } from '@/lib/utils';

/**
 * The launch dashboard from §20 of the economy design. Every row carries the
 * band the doc set, so a number is readable without the doc open, and the
 * status says which way it is drifting rather than only pass/fail.
 */
export type HealthStatus = 'good' | 'watch' | 'bad' | 'unknown';

export type HealthMetric = {
  key: string;
  label: string;
  /** Null when there is not enough data yet to say anything. */
  value: number | null;
  unit: 'ratio' | 'percent' | 'flies' | 'count' | 'days';
  target: string;
  min?: number;
  max?: number;
  status: HealthStatus;
  /** What to do about it, straight from §20's dial-turning table. */
  hint?: string;
};

const WINDOW_DAYS = 28;

const EPIC_PLUS_IDS = CATALOG.filter(
  (item) => rarityRank[item.rarity] >= rarityRank.epic,
).map((item) => item.id);

function statusFor(
  value: number | null,
  min?: number,
  max?: number,
): HealthStatus {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  const lowBad = min !== undefined && value < min;
  const highBad = max !== undefined && value > max;
  if (!lowBad && !highBad) return 'good';
  // A 15% overshoot of the band is drift; beyond that it needs a decision.
  const span = (max ?? min ?? 1) - (min ?? max ?? 0) || Math.abs(max ?? min ?? 1);
  const slack = Math.abs(span) * 0.15;
  if (lowBad && min !== undefined && min - value <= slack) return 'watch';
  if (highBad && max !== undefined && value - max <= slack) return 'watch';
  return 'bad';
}

function metric(
  key: string,
  label: string,
  value: number | null,
  unit: HealthMetric['unit'],
  target: string,
  bounds: { min?: number; max?: number },
  hint?: string,
): HealthMetric {
  return {
    key,
    label,
    value: value === null ? null : Math.round(value * 1000) / 1000,
    unit,
    target,
    min: bounds.min,
    max: bounds.max,
    status: statusFor(value, bounds.min, bounds.max),
    hint,
  };
}

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

export type FaucetShare = {
  source: string;
  flies: number;
  share: number;
  /** The share §3's master budget predicted, where the doc named one. */
  budgetShare: number | null;
};

/** §3's core-free split, for reading actual composition against intent. */
const BUDGET_SHARES: Record<string, number> = {
  task: 3,
  task_streak: 4,
  buddy: 2,
  friend_pond: 8,
  friend_pond_double: 0,
  quest: 40,
  season: 11,
  pact: 21,
  login_streak: 10,
  focus: 0,
  deep_focus: 0,
};

export async function readEconomyHealth(timezone = 'UTC') {
  await connectMongo();

  const today = getZonedToday(timezone);
  const from = daysAgoKey(today, WINDOW_DAYS - 1);
  const range = { $gte: from, $lte: today };

  const [flowRows, sourceRows, dauRows, breakerRows] = await Promise.all([
    FlyLedgerModel.aggregate<{ _id: 'in' | 'out'; total: number }>([
      { $match: { dayKey: range } },
      {
        $group: {
          _id: { $cond: [{ $gt: ['$amount', 0] }, 'in', 'out'] },
          total: { $sum: '$amount' },
        },
      },
    ]),
    FlyLedgerModel.aggregate<{ _id: string; total: number }>([
      { $match: { dayKey: range, amount: { $gt: 0 } } },
      { $group: { _id: '$source', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]),
    FlyLedgerModel.aggregate<{ _id: string; users: number }>([
      { $match: { dayKey: range, amount: { $gt: 0 } } },
      { $group: { _id: '$dayKey', users: { $addToSet: '$userId' } } },
      { $project: { users: { $size: '$users' } } },
    ]),
    AnalyticsEventModel.countDocuments({
      name: 'fly_circuit_breaker',
      occurredAt: { $gte: new Date(Date.now() - WINDOW_DAYS * 86_400_000) },
    }).catch(() => 0),
  ]);

  const faucet = flowRows.find((r) => r._id === 'in')?.total ?? 0;
  const sink = Math.abs(flowRows.find((r) => r._id === 'out')?.total ?? 0);
  const sinkFaucet = faucet > 0 ? sink / faucet : null;

  const dauDays = dauRows.length;
  const avgDau = dauDays
    ? dauRows.reduce((sum, row) => sum + row.users, 0) / dauDays
    : 0;
  const fliesPerDau = avgDau > 0 ? faucet / WINDOW_DAYS / avgDau : null;

  const earningTotal = sourceRows.reduce((sum, row) => sum + row.total, 0);
  const faucetShares: FaucetShare[] = sourceRows.map((row) => ({
    source: row._id,
    flies: row.total,
    share: earningTotal > 0 ? (row.total / earningTotal) * 100 : 0,
    budgetShare: BUDGET_SHARES[row._id] ?? null,
  }));

  const [balances, premiumCount, activeCount, epicOwners, cohort] =
    await Promise.all([
      UserModel.aggregate<{ _id: null; values: number[] }>([
        { $match: { 'wardrobe.flies': { $gt: 0 } } },
        { $group: { _id: null, values: { $push: '$wardrobe.flies' } } },
      ]),
      UserModel.countDocuments({ premiumUntil: { $gt: new Date() } }),
      UserModel.countDocuments({}),
      // "Owns an Epic" has to be read off the inventory keys, since rarity
      // lives in the catalog rather than on the user.
      EPIC_PLUS_IDS.length
        ? UserModel.countDocuments({
            createdAt: { $lte: new Date(Date.now() - 30 * 86_400_000) },
            $or: EPIC_PLUS_IDS.map((id) => ({
              [`wardrobe.inventory.${id}`]: { $gt: 0 },
            })),
          }).catch(() => null)
        : Promise.resolve(null),
      UserModel.countDocuments({
        createdAt: { $lte: new Date(Date.now() - 30 * 86_400_000) },
      }).catch(() => 0),
    ]);

  const values = (balances[0]?.values ?? []).sort((a, b) => a - b);
  const medianBalance = values.length
    ? values[Math.floor(values.length / 2)]
    : null;
  // §20 reads the balance in days of income, not flies.
  const medianBalanceDays =
    medianBalance !== null && fliesPerDau && fliesPerDau > 0
      ? medianBalance / fliesPerDau
      : null;

  const metrics: HealthMetric[] = [
    metric(
      'sinkFaucet',
      'Sink / faucet ratio',
      sinkFaucet,
      'ratio',
      '0.85 – 1.00',
      { min: 0.85, max: 1.0 },
      'Below 0.70 you are inflating — add a sink before cutting a faucet.',
    ),
    metric(
      'medianBalanceDays',
      'Median balance, in days of income',
      medianBalanceDays,
      'days',
      '< 3 days',
      { max: 3 },
      'Above 7 days the shop is under-stocked or over-priced.',
    ),
    metric(
      'fliesPerDau',
      'Flies earned / DAU',
      fliesPerDau,
      'flies',
      '~90',
      { min: 60, max: 130 },
      'Drift above 130 means a faucet is leaking.',
    ),
    metric(
      'plusConversion',
      'Plus conversion',
      pct(premiumCount, activeCount),
      'percent',
      '3 – 6% of MAU',
      { min: 3, max: 6 },
      'Below target, add to the season Plus track — never to the fly multiplier.',
    ),
    metric(
      'epicByDay30',
      'Own ≥1 Epic by day 30',
      epicOwners === null ? null : pct(epicOwners, cohort),
      'percent',
      '25 – 35%',
      { min: 25, max: 35 },
      'The best single measure of whether progression feels good.',
    ),
    metric(
      'breakerTrips',
      'Circuit-breaker trips (28d)',
      breakerRows,
      'count',
      '0 — no legitimate user reaches 400/day',
      { max: 0 },
      'Every trip is an exploit early-warning. Investigate the user and source.',
    ),
  ];

  return {
    windowDays: WINDOW_DAYS,
    from,
    to: today,
    faucet,
    sink,
    avgDau: Math.round(avgDau * 10) / 10,
    medianBalance,
    metrics,
    faucetShares,
  };
}
