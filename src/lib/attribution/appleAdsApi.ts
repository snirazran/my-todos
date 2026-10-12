import crypto from 'node:crypto';
import connectMongo from '@/lib/mongoose';
import AppleAdsSyncStateModel, { APPLE_ADS_SYNC_STATE_ID } from '@/lib/models/AppleAdsSyncState';
import { importSpend } from './spend';
import type { ParsedSpend, ParsedSpendRow, SpendLevel } from './spendImport';

const API = 'https://api.ads.apple.com/v1';
const TOKEN_URL = 'https://appleid.apple.com/auth/oauth2/token';
const PAGE_SIZE = 1000;
const ROLLING_DAYS = 90;
const BACKFILL_DAYS = 365;
const CHUNK_DAYS = 90;
export const APPLE_ADS_SYNC_LABEL = 'Apple Ads API';
const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;

type Credentials = { clientId: string; teamId: string; keyId: string; privateKey: string };

type Money = { amount?: string; currency?: string };
type DayMetrics = {
  date: string;
  localSpend?: Money;
  impressions?: number;
  taps?: number;
  tapInstalls?: number;
};
type ReportRow = {
  metadata: Record<string, any>;
  granularMetrics?: DayMetrics[];
};

export type AppleAdsSyncResult = {
  start: string;
  end: string;
  days: number;
  campaigns: number;
  rows: Record<SpendLevel, number>;
  spend: number;
  currency: string | null;
};

type SyncState = {
  running: boolean;
  token?: { value: string; expiresAt: number };
  adAccountId?: string;
};

const g = globalThis as typeof globalThis & { appleAdsSync?: SyncState };
const state: SyncState = (g.appleAdsSync ??= { running: false });

function normalizePem(raw: string) {
  const unquoted = raw.trim().replace(/^"|"$/g, '').replaceAll(String.raw`\n`, '\n');
  const decoded = unquoted.includes('-----BEGIN')
    ? unquoted
    : Buffer.from(unquoted, 'base64').toString('utf8');
  const label = decoded.match(/-----BEGIN ([A-Z ]+)-----/)?.[1];
  if (!label) throw new Error('APPLE_ADS_PRIVATE_KEY is not a PEM key');
  const body = decoded.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

function readCredentials(): Credentials | null {
  const clientId = process.env.APPLE_ADS_CLIENT_ID?.trim();
  const teamId = process.env.APPLE_ADS_TEAM_ID?.trim();
  const keyId = process.env.APPLE_ADS_KEY_ID?.trim();
  const privateKey = process.env.APPLE_ADS_PRIVATE_KEY?.trim();
  if (!clientId || !teamId || !keyId || !privateKey) return null;
  return { clientId, teamId, keyId, privateKey: normalizePem(privateKey) };
}

export function appleAdsConfigured() {
  return !!(
    process.env.APPLE_ADS_CLIENT_ID &&
    process.env.APPLE_ADS_TEAM_ID &&
    process.env.APPLE_ADS_KEY_ID &&
    process.env.APPLE_ADS_PRIVATE_KEY
  );
}

function clientSecret(creds: Credentials) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'ES256', kid: creds.keyId })}.${encode({
    iss: creds.teamId,
    sub: creds.clientId,
    aud: 'https://appleid.apple.com',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.sign('sha256', Buffer.from(input), {
    key: creds.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${signature.toString('base64url')}`;
}

async function accessToken(creds: Credentials) {
  if (state.token && state.token.expiresAt > Date.now() + 60_000) return state.token.value;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: clientSecret(creds),
      scope: 'searchadsorg',
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Apple Ads sign-in failed (${response.status} ${body.error ?? ''})`.trim());
  }
  state.token = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000,
  };
  return state.token.value;
}

async function call<T>(creds: Credentials, path: string, init: { body?: unknown; adAccountId?: string } = {}) {
  const token = await accessToken(creds);
  const response = await fetch(`${API}${path}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.adAccountId ? { 'X-AP-Context': `adAccountId=${init.adAccountId}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.details?.[0]?.message ?? body?.error?.message ?? '';
    throw new Error(`Apple Ads ${path} failed (${response.status}) ${detail}`.trim());
  }
  return body as T;
}

async function resolveAdAccountId(creds: Credentials) {
  const configured = process.env.APPLE_ADS_AD_ACCOUNT_ID?.trim();
  if (configured) return configured;
  if (state.adAccountId) return state.adAccountId;
  const body = await call<{ result?: { acls?: Array<{ adAccount?: { id?: number | string } }> } }>(
    creds,
    '/acls',
  );
  const id = body.result?.acls?.[0]?.adAccount?.id;
  if (!id) throw new Error('This Apple Ads API user cannot see any ad account');
  state.adAccountId = String(id);
  return state.adAccountId;
}

async function listCampaigns(creds: Credentials, adAccountId: string) {
  const campaigns: Array<{ id: string; name: string }> = [];
  for (let offset = 0; offset < 10_000; offset += PAGE_SIZE) {
    const body = await call<{ result?: Array<{ id: number | string; name: string }>; pagination?: { totalResults?: number; totalCount?: number } }>(
      creds,
      '/campaigns/query',
      { adAccountId, body: { pagination: { offset, pageSize: PAGE_SIZE } } },
    );
    const page = Array.isArray(body.result) ? body.result : [];
    campaigns.push(...page.map((campaign) => ({ id: String(campaign.id), name: campaign.name })));
    if (page.length < PAGE_SIZE) break;
  }
  return campaigns;
}

const REPORT_PATH: Record<SpendLevel, { path: string; filterField: string }> = {
  campaign: { path: '/reports/apps/campaigns/query', filterField: 'id' },
  adGroup: { path: '/reports/apps/adgroups/query', filterField: 'campaignId' },
  keyword: { path: '/reports/apps/keywords/query', filterField: 'campaignId' },
};

async function fetchReport(
  creds: Credentials,
  adAccountId: string,
  level: SpendLevel,
  campaignId: string,
  start: string,
  end: string,
) {
  const { path, filterField } = REPORT_PATH[level];
  const rows: ReportRow[] = [];
  for (let offset = 0; offset < 50_000; offset += PAGE_SIZE) {
    const body = await call<{ result?: { rows?: ReportRow[] } }>(creds, path, {
      adAccountId,
      body: {
        filters: [{ field: filterField, operator: 'EQUALS', value: campaignId }],
        timeRange: { start, end, timeZone: 'UTC', granularity: 'DAILY' },
        pagination: { offset, pageSize: PAGE_SIZE },
      },
    });
    const page = body.result?.rows ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function toParsed(level: SpendLevel, rows: ParsedSpendRow[], start: string, end: string): ParsedSpend {
  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      impressions: sum.impressions + row.impressions,
      taps: sum.taps + row.taps,
      installs: sum.installs + row.installs,
    }),
    { spend: 0, impressions: 0, taps: 0, installs: 0 },
  );
  return {
    level,
    hasDate: true,
    meta: {},
    campaigns: Array.from(new Set(rows.map((row) => row.campaign))),
    rows,
    columns: {},
    warnings: [],
    totals,
    dateRange: { start, end },
  };
}

function rowLabels(level: SpendLevel, meta: Record<string, any>, adGroupNames: Map<string, string>) {
  if (level === 'adGroup') {
    const name = String(meta.name ?? meta.id);
    adGroupNames.set(String(meta.id), name);
    return { adGroup: name, keyword: undefined };
  }
  if (level === 'keyword') {
    const adGroup = meta.adGroup?.name ?? adGroupNames.get(String(meta.adGroupId)) ?? String(meta.adGroupId ?? '');
    return { adGroup: adGroup || undefined, keyword: String(meta.text ?? meta.keyword ?? meta.id) };
  }
  return { adGroup: undefined, keyword: undefined };
}

function reportRowToSpend(
  level: SpendLevel,
  campaign: string,
  row: ReportRow,
  adGroupNames: Map<string, string>,
) {
  const labels = rowLabels(level, row.metadata ?? {}, adGroupNames);
  const rows: ParsedSpendRow[] = [];
  let currency: string | null = null;
  for (const day of row.granularMetrics ?? []) {
    const spend = Number(day.localSpend?.amount) || 0;
    const impressions = Number(day.impressions) || 0;
    const taps = Number(day.taps) || 0;
    const installs = Number(day.tapInstalls) || 0;
    if (!spend && !impressions && !taps && !installs) continue;
    currency ??= day.localSpend?.currency ?? null;
    rows.push({ date: day.date, campaign, ...labels, spend, impressions, taps, installs });
  }
  return { rows, currency };
}

function dayOffset(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function collectWindow(
  creds: Credentials,
  adAccountId: string,
  campaigns: Array<{ id: string; name: string }>,
  start: string,
  end: string,
) {
  const byLevel: Record<SpendLevel, ParsedSpendRow[]> = { campaign: [], adGroup: [], keyword: [] };
  let currency: string | null = null;
  for (const campaign of campaigns) {
    const adGroupNames = new Map<string, string>();
    for (const level of ['campaign', 'adGroup', 'keyword'] as const) {
      const report = await fetchReport(creds, adAccountId, level, campaign.id, start, end);
      for (const row of report) {
        const spendRows = reportRowToSpend(level, campaign.name, row, adGroupNames);
        byLevel[level].push(...spendRows.rows);
        currency ??= spendRows.currency;
      }
    }
  }
  return { byLevel, currency };
}

async function loadSyncState() {
  await connectMongo();
  return AppleAdsSyncStateModel.findOne({ configId: APPLE_ADS_SYNC_STATE_ID }).lean();
}

async function saveSyncState(update: Partial<AppleAdsSyncStateFields>) {
  await connectMongo();
  await AppleAdsSyncStateModel.updateOne(
    { configId: APPLE_ADS_SYNC_STATE_ID },
    { $set: update },
    { upsert: true },
  );
}

type AppleAdsSyncStateFields = {
  backfilledFrom: string;
  lastRunAt: Date;
  lastOkAt: Date;
  lastError: string | null;
  lastResult: AppleAdsSyncResult;
};

export async function syncAppleAdsSpend(days?: number): Promise<AppleAdsSyncResult> {
  const creds = readCredentials();
  if (!creds) throw new Error('Apple Ads API keys are not set');
  if (state.running) throw new Error('A sync is already running');
  state.running = true;

  try {
    await saveSyncState({ lastRunAt: new Date() });
    const saved = await loadSyncState();
    const span = days ?? (saved?.backfilledFrom ? ROLLING_DAYS : BACKFILL_DAYS);
    const adAccountId = await resolveAdAccountId(creds);
    const campaigns = await listCampaigns(creds, adAccountId);
    const end = dayOffset(0);
    const start = dayOffset(span - 1);
    const rows: Record<SpendLevel, number> = { campaign: 0, adGroup: 0, keyword: 0 };
    let spend = 0;
    let currency: string | null = null;

    for (let offset = span - 1; offset >= 0; offset -= CHUNK_DAYS) {
      const from = dayOffset(offset);
      const to = dayOffset(Math.max(0, offset - CHUNK_DAYS + 1));
      const window = await collectWindow(creds, adAccountId, campaigns, from, to);
      currency ??= window.currency;
      for (const level of ['campaign', 'adGroup', 'keyword'] as const) {
        rows[level] += window.byLevel[level].length;
        if (window.byLevel[level].length === 0) continue;
        await importSpend({
          channel: 'apple_ads',
          parsed: toParsed(level, window.byLevel[level], from, to),
          label: APPLE_ADS_SYNC_LABEL,
        });
      }
      spend += window.byLevel.campaign.reduce((sum, row) => sum + row.spend, 0);
    }

    const result: AppleAdsSyncResult = {
      start,
      end,
      days: span,
      campaigns: campaigns.length,
      rows,
      spend: Math.round(spend * 100) / 100,
      currency,
    };
    await saveSyncState({
      lastOkAt: new Date(),
      lastError: null,
      lastResult: result,
      ...(saved?.backfilledFrom && saved.backfilledFrom <= start ? {} : { backfilledFrom: start }),
    });
    return result;
  } catch (error) {
    await saveSyncState({
      lastError: error instanceof Error ? error.message : 'Apple Ads sync failed',
    }).catch(() => {});
    throw error;
  } finally {
    state.running = false;
  }
}

export async function appleAdsSyncStatus() {
  const saved = await loadSyncState();
  const iso = (value?: Date | null) => (value ? new Date(value).toISOString() : null);
  return {
    configured: appleAdsConfigured(),
    running: state.running,
    lastRunAt: iso(saved?.lastRunAt),
    lastOkAt: iso(saved?.lastOkAt),
    lastError: saved?.lastError ?? null,
    lastResult: (saved?.lastResult as AppleAdsSyncResult | null) ?? null,
    backfilledFrom: saved?.backfilledFrom ?? null,
  };
}

export async function runScheduledAppleAdsSync() {
  if (!appleAdsConfigured() || state.running) return;
  const saved = await loadSyncState();
  const last = saved?.lastRunAt ? new Date(saved.lastRunAt).getTime() : 0;
  if (Date.now() - last < AUTO_SYNC_MS) return;
  await syncAppleAdsSpend().catch((error) => {
    console.error('Apple Ads sync failed:', error);
  });
}
