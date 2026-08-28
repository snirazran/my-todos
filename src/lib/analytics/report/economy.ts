import FlyLedgerModel from '@/lib/models/FlyLedger';
import UserModel from '@/lib/models/User';
import { readEconomyHealth } from '@/lib/economy/health';
import type { StatSection, StatTable } from '@/lib/analytics/catalog';
import { kpi, rate, round, ymd, type ReportContext } from './context';

type LedgerRow = { _id: string; total: number; entries: number; users: number };

const BALANCE_BUCKETS = [
  { label: '0', min: 0, max: 0 },
  { label: '1 – 99', min: 1, max: 99 },
  { label: '100 – 499', min: 100, max: 499 },
  { label: '500 – 1,999', min: 500, max: 1_999 },
  { label: '2,000 – 9,999', min: 2_000, max: 9_999 },
  { label: '10,000+', min: 10_000, max: Number.MAX_SAFE_INTEGER },
];

export async function buildEconomy(context: ReportContext): Promise<StatSection> {
  const dayRange = { $gte: ymd(context.range.start), $lte: ymd(context.range.endDay) };

  const [faucetRows, sinkRows, dailyFlow, balanceRows, health] = await Promise.all([
    FlyLedgerModel.aggregate<LedgerRow>([
      { $match: { dayKey: dayRange, amount: { $gt: 0 } } },
      {
        $group: {
          _id: '$source',
          total: { $sum: '$amount' },
          entries: { $sum: 1 },
          userSet: { $addToSet: '$userId' },
        },
      },
      { $project: { total: 1, entries: 1, users: { $size: '$userSet' } } },
      { $sort: { total: -1 } },
    ]),
    FlyLedgerModel.aggregate<LedgerRow>([
      { $match: { dayKey: dayRange, amount: { $lt: 0 } } },
      {
        $group: {
          _id: '$source',
          total: { $sum: '$amount' },
          entries: { $sum: 1 },
          userSet: { $addToSet: '$userId' },
        },
      },
      { $project: { total: 1, entries: 1, users: { $size: '$userSet' } } },
      { $sort: { total: 1 } },
    ]),
    FlyLedgerModel.aggregate<{ _id: string; earned: number; spent: number }>([
      { $match: { dayKey: dayRange } },
      {
        $group: {
          _id: '$dayKey',
          earned: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
          spent: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
        },
      },
    ]),
    UserModel.aggregate<{ _id: null; buckets: number[] }>([
      { $project: { flies: { $ifNull: ['$wardrobe.flies', 0] } } },
      { $group: { _id: null, buckets: { $push: '$flies' } } },
    ]),
    readEconomyHealth().catch(() => null),
  ]);

  const faucet = faucetRows.reduce((sum, row) => sum + row.total, 0);
  const sink = Math.abs(sinkRows.reduce((sum, row) => sum + row.total, 0));
  const dailyMap = new Map(dailyFlow.map((row) => [row._id, row]));
  const balances = balanceRows[0]?.buckets ?? [];

  const healthTable: StatTable = {
    key: 'economy.health',
    title: 'Economy health dials',
    question: 'Is any single dial outside the band the economy design set for it?',
    columns: [
      { key: 'metric', label: 'Dial' },
      { key: 'value', label: 'Value', format: 'decimal' },
      { key: 'target', label: 'Target band' },
      { key: 'status', label: 'Status' },
      { key: 'hint', label: 'If it drifts' },
    ],
    rows: (health?.metrics ?? []).map((entry) => ({
      metric: entry.label,
      value: entry.value,
      target: entry.target,
      status: entry.status,
      hint: entry.hint ?? '',
    })),
    note: health
      ? `Measured over the trailing ${health.windowDays} days from the fly ledger, independent of the range above.`
      : 'Economy health could not be read.',
  };

  return {
    id: 'economy',
    title: 'Fly economy',
    question: 'Is the currency balanced — earned as fast as it is spent?',
    blurb: 'Faucets, sinks, balances, and the guards that stop runaway income.',
    kpis: [
      kpi('flies_earned', faucet, {
        sparkline: context.dates.map((date) => dailyMap.get(date)?.earned ?? 0),
      }),
      kpi('flies_spent', sink, {
        sparkline: context.dates.map((date) => dailyMap.get(date)?.spent ?? 0),
      }),
      kpi('sink_faucet_ratio', health?.metrics.find((m) => m.key === 'sinkFaucet')?.value ?? null),
      kpi('flies_per_dau', health?.metrics.find((m) => m.key === 'fliesPerDau')?.value ?? null),
      kpi(
        'median_balance_days',
        health?.metrics.find((m) => m.key === 'medianBalanceDays')?.value ?? null,
      ),
      kpi('breaker_trips', context.events('fly_circuit_breaker')),
    ],
    series: [
      {
        key: 'economy.flow',
        title: 'Faucet versus sink',
        question: 'Are flies leaving circulation as fast as they enter it?',
        lines: [
          { key: 'earned', label: 'Earned', format: 'integer' },
          { key: 'spent', label: 'Spent', format: 'integer' },
        ],
        points: context.dates.map((date) => ({
          date,
          earned: dailyMap.get(date)?.earned ?? 0,
          spent: dailyMap.get(date)?.spent ?? 0,
        })),
      },
    ],
    tables: [
      healthTable,
      {
        key: 'economy.faucets',
        title: 'Where flies come from',
        question: 'Does the real income mix match the budget the economy was designed against?',
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'flies', label: 'Flies', format: 'integer' },
          { key: 'share', label: 'Actual share', format: 'percent' },
          { key: 'budget', label: 'Designed share', format: 'percent' },
          { key: 'drift', label: 'Drift', format: 'percent' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'per_user', label: 'Flies / user', format: 'decimal' },
        ],
        rows: faucetRows.map((row) => {
          const share = rate(row.total, faucet);
          const budget =
            health?.faucetShares.find((entry) => entry.source === row._id)?.budgetShare ?? null;
          return {
            source: row._id,
            flies: row.total,
            share,
            budget,
            drift: budget === null ? null : round(share - budget, 1),
            users: row.users,
            per_user: round(row.total / (row.users || 1), 1),
          };
        }),
        note: 'Drift is actual share minus designed share. A large positive drift is the faucet to trim first.',
      },
      {
        key: 'economy.sinks',
        title: 'Where flies go',
        question: 'Is there a sink big enough to absorb what the app pays out?',
        columns: [
          { key: 'source', label: 'Sink' },
          { key: 'flies', label: 'Flies', format: 'integer' },
          { key: 'share', label: 'Share of sink', format: 'percent' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'per_user', label: 'Flies / user', format: 'decimal' },
        ],
        rows: sinkRows.map((row) => ({
          source: row._id,
          flies: Math.abs(row.total),
          share: rate(Math.abs(row.total), sink),
          users: row.users,
          per_user: round(Math.abs(row.total) / (row.users || 1), 1),
        })),
      },
      {
        key: 'economy.balances',
        title: 'Balance distribution',
        question: 'How many people are sitting on flies with nothing they want to buy?',
        columns: [
          { key: 'bucket', label: 'Balance' },
          { key: 'users', label: 'Accounts', format: 'integer' },
          { key: 'share', label: 'Share', format: 'percent' },
        ],
        rows: BALANCE_BUCKETS.map((bucket) => {
          const count = balances.filter(
            (value) => value >= bucket.min && value <= bucket.max,
          ).length;
          return {
            bucket: bucket.label,
            users: count,
            share: rate(count, balances.length),
          };
        }),
        note: 'A fat tail in the top buckets means the catalog is under-stocked, not that people are rich.',
      },
    ],
  };
}
