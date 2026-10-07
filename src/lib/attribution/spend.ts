import { randomUUID } from 'crypto';
import connectMongo from '@/lib/mongoose';
import AdSpendModel, { type AdSpendDoc } from '@/lib/models/AdSpend';
import AdSpendImportModel from '@/lib/models/AdSpendImport';
import { normalizeKey } from './classify';
import type { ParsedSpend, SpendLevel } from './spendImport';

function daysBetween(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function importSpend(input: {
  channel: string;
  parsed: ParsedSpend;
  start?: string;
  end?: string;
  label?: string;
}) {
  const { parsed, channel } = input;
  const spread = !parsed.hasDate;
  const start = spread ? input.start ?? parsed.dateRange?.start : parsed.dateRange?.start;
  const end = spread ? input.end ?? parsed.dateRange?.end : parsed.dateRange?.end;
  if (!start || !end || start > end) {
    throw new Error('This report has no day column and no date range at the top — pick the dates it covers.');
  }
  const days = daysBetween(start, end);
  if (!days.length) throw new Error('The date range is empty.');

  await connectMongo();
  const batchId = randomUUID();
  const importedAt = new Date();
  const documents: AdSpendDoc[] = [];

  for (const row of parsed.rows) {
    const targets = spread ? days : [row.date as string];
    const share = spread ? 1 / days.length : 1;
    for (const date of targets) {
      documents.push({
        batchId,
        channel,
        level: parsed.level,
        date,
        campaign: row.campaign,
        adGroup: row.adGroup,
        keyword: row.keyword,
        campaignKey: normalizeKey(row.campaign),
        adGroupKey: row.adGroup ? normalizeKey(row.adGroup) : undefined,
        keywordKey: row.keyword ? normalizeKey(row.keyword) : undefined,
        spend: row.spend * share,
        impressions: row.impressions * share,
        taps: row.taps * share,
        installs: row.installs * share,
        spread,
        importedAt,
      });
    }
  }

  const scope = {
    channel,
    level: parsed.level,
    date: { $gte: start, $lte: end },
    campaignKey: { $in: Array.from(new Set(documents.map((document) => document.campaignKey))) },
  };
  const replaced = await AdSpendModel.distinct('batchId', scope);
  await AdSpendModel.deleteMany(scope);
  await AdSpendModel.insertMany(documents, { ordered: false });
  await AdSpendImportModel.create({
    _id: batchId,
    channel,
    level: parsed.level,
    start,
    end,
    rows: parsed.rows.length,
    spend: parsed.totals.spend,
    installs: parsed.totals.installs,
    taps: parsed.totals.taps,
    spread,
    label: input.label?.slice(0, 120) || undefined,
    createdAt: importedAt,
  });
  await refreshBatches(replaced.map(String));
  return { batchId, start, end, level: parsed.level, documents: documents.length };
}

async function refreshBatches(batchIds: string[]) {
  for (const batchId of batchIds) {
    const remaining = await AdSpendModel.aggregate<{ _id: null; count: number; spend: number; installs: number; taps: number; start: string; end: string }>([
      { $match: { batchId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          spend: { $sum: '$spend' },
          installs: { $sum: '$installs' },
          taps: { $sum: '$taps' },
          start: { $min: '$date' },
          end: { $max: '$date' },
        },
      },
    ]);
    const summary = remaining[0];
    if (!summary) {
      await AdSpendImportModel.deleteOne({ _id: batchId });
      continue;
    }
    await AdSpendImportModel.updateOne(
      { _id: batchId },
      {
        $set: {
          spend: Math.round(summary.spend * 100) / 100,
          installs: summary.installs,
          taps: summary.taps,
          start: summary.start,
          end: summary.end,
        },
      },
    );
  }
}

export async function listSpendImports() {
  await connectMongo();
  return AdSpendImportModel.find({}).sort({ createdAt: -1 }).limit(100).lean();
}

export async function deleteSpendImport(batchId: string) {
  await connectMongo();
  await AdSpendModel.deleteMany({ batchId });
  await AdSpendImportModel.deleteOne({ _id: batchId });
}

export type SpendRow = {
  channel: string;
  level: SpendLevel;
  campaign: string;
  adGroup?: string;
  keyword?: string;
  campaignKey: string;
  adGroupKey?: string;
  keywordKey?: string;
  spend: number;
  impressions: number;
  taps: number;
  installs: number;
  spread: boolean;
};

export async function loadSpend(start: string, end: string): Promise<SpendRow[]> {
  return AdSpendModel.aggregate<SpendRow>([
    { $match: { date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: {
          channel: '$channel',
          level: '$level',
          campaignKey: '$campaignKey',
          adGroupKey: '$adGroupKey',
          keywordKey: '$keywordKey',
        },
        campaign: { $first: '$campaign' },
        adGroup: { $first: '$adGroup' },
        keyword: { $first: '$keyword' },
        spend: { $sum: '$spend' },
        impressions: { $sum: '$impressions' },
        taps: { $sum: '$taps' },
        installs: { $sum: '$installs' },
        spread: { $max: '$spread' },
      },
    },
    {
      $project: {
        _id: 0,
        channel: '$_id.channel',
        level: '$_id.level',
        campaignKey: '$_id.campaignKey',
        adGroupKey: '$_id.adGroupKey',
        keywordKey: '$_id.keywordKey',
        campaign: 1,
        adGroup: 1,
        keyword: 1,
        spend: 1,
        impressions: 1,
        taps: 1,
        installs: 1,
        spread: 1,
      },
    },
  ]);
}
