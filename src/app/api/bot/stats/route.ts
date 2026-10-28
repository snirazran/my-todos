import { NextRequest, NextResponse } from 'next/server';
import { buildSnapshot } from '@/lib/analytics/report';
import { addUtcDays, startOfUtcDay, ymd } from '@/lib/analytics/report/context';
import {
  snapshotToBrief,
  snapshotToDays,
  withDeclaredColumnsOnly,
} from '@/lib/analytics/export';
import {
  clientIp,
  createRateLimiter,
  statsApiEnabled,
  verifyStatsApiKey,
} from '@/lib/statsApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = ['json', 'brief', 'days'] as const;
type Format = (typeof FORMATS)[number];
const MAX_SPAN_DAYS = 400;

const failedAuth = createRateLimiter(10, 15 * 60_000);
const builds = createRateLimiter(30, 10 * 60_000);

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function isDay(value: string | null): value is string {
  if (!value || !YMD.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function resolveDay(value: string) {
  const today = startOfUtcDay(new Date());
  if (value === 'today') return ymd(today);
  if (value === 'yesterday') return ymd(addUtcDays(today, -1));
  return isDay(value) ? value : null;
}

function spanDays(start: string, end: string) {
  const from = new Date(`${start}T00:00:00.000Z`).getTime();
  const to = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

function parseRange(params: URLSearchParams): { start: string | null; end: string | null } | string {
  const date = params.get('date');
  if (date) {
    const day = resolveDay(date);
    return day ? { start: day, end: day } : 'date must be YYYY-MM-DD, "today" or "yesterday"';
  }
  const start = params.get('start');
  const end = params.get('end');
  if ((start && !isDay(start)) || (end && !isDay(end))) {
    return 'start and end must be real dates in YYYY-MM-DD';
  }
  if (start && end) {
    const span = spanDays(start, end);
    if (span < 1) return 'start must be on or before end';
    if (span > MAX_SPAN_DAYS) return `A range can cover at most ${MAX_SPAN_DAYS} days`;
  }
  return { start, end };
}

function rejectUnauthorized(req: NextRequest) {
  const ip = clientIp(req);
  const lockout = failedAuth.check(ip);
  if (lockout.limited) {
    return json({ error: 'Too many failed attempts' }, 429, {
      'Retry-After': String(lockout.retryAfterSeconds),
    });
  }
  failedAuth.hit(ip);
  console.warn(`Stats API: rejected request from ${ip}`);
  return json({ error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
}

function markdown(body: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  if (!statsApiEnabled()) return json({ error: 'Not found' }, 404);
  if (!verifyStatsApiKey(req.headers.get('authorization'))) return rejectUnauthorized(req);

  const params = req.nextUrl.searchParams;
  const format = (params.get('format') ?? 'json') as Format;
  if (!FORMATS.includes(format)) {
    return json({ error: `format must be one of: ${FORMATS.join(', ')}` }, 400);
  }

  const range = parseRange(params);
  if (typeof range === 'string') return json({ error: range }, 400);

  const quota = builds.hit('all');
  if (quota.limited) {
    return json({ error: 'Rate limit reached' }, 429, {
      'Retry-After': String(quota.retryAfterSeconds),
    });
  }

  try {
    const snapshot = withDeclaredColumnsOnly(
      await buildSnapshot({
        ...range,
        days: params.get('days') ? Number(params.get('days')) : null,
        compare: params.get('compare') !== '0',
      }),
    );

    if (format === 'brief') {
      const rows = Number(params.get('rows') ?? 20);
      return markdown(
        snapshotToBrief(snapshot, {
          rowLimit: Number.isFinite(rows) ? Math.min(300, Math.max(1, rows)) : 20,
        }),
      );
    }
    if (format === 'days') return json(snapshotToDays(snapshot));
    return json(snapshot);
  } catch (error) {
    console.error('Stats API snapshot failed:', error);
    return json({ error: 'Statistics could not be built' }, 500);
  }
}
