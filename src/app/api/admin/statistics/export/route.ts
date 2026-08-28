import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import { buildSnapshot } from '@/lib/analytics/report';
import { resolveRange, ymd } from '@/lib/analytics/report/context';
import {
  exportFilename,
  snapshotToBrief,
  snapshotToTidyCsv,
  tableToCsv,
} from '@/lib/analytics/export';

export const dynamic = 'force-dynamic';

const EVENT_EXPORT_LIMIT = 200_000;

function attachment(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const format = params.get('format') ?? 'csv';
  const rangeParams = {
    start: params.get('start'),
    end: params.get('end'),
    days: params.get('days') ? Number(params.get('days')) : null,
  };

  try {
    if (format === 'events') {
      await connectMongo();
      const range = resolveRange(rangeParams);
      const filter: Record<string, unknown> = {
        occurredAt: { $gte: range.start, $lt: range.endExclusive },
      };
      const event = params.get('event');
      if (event) filter.name = event;
      const category = params.get('category');
      if (category) filter.category = category;

      const rows = await AnalyticsEventModel.find(filter)
        .select('userId name category source platform sessionId properties occurredAt')
        .sort({ occurredAt: 1 })
        .limit(EVENT_EXPORT_LIMIT)
        .lean();

      const body = rows
        .map((row) =>
          JSON.stringify({
            occurred_at: new Date(row.occurredAt).toISOString(),
            user_id: row.userId,
            event: row.name,
            category: row.category,
            source: row.source,
            platform: row.platform,
            session_id: row.sessionId ?? null,
            ...row.properties,
          }),
        )
        .join('\n');

      return attachment(
        body,
        `frogress-events_${ymd(range.start)}_${ymd(range.endDay)}.ndjson`,
        'application/x-ndjson; charset=utf-8',
      );
    }

    const snapshot = await buildSnapshot({
      ...rangeParams,
      compare: params.get('compare') === '1',
    });

    if (format === 'json') {
      return attachment(
        JSON.stringify(snapshot, null, 2),
        exportFilename(snapshot, 'analytics', 'json'),
        'application/json; charset=utf-8',
      );
    }

    if (format === 'md' || format === 'brief') {
      return attachment(
        snapshotToBrief(snapshot, { rowLimit: Number(params.get('rows') ?? 20) }),
        exportFilename(snapshot, 'brief', 'md'),
        'text/markdown; charset=utf-8',
      );
    }

    if (format === 'table') {
      const key = params.get('table');
      const table = snapshot.sections
        .flatMap((section) => section.tables)
        .find((candidate) => candidate.key === key);
      if (!table) {
        return NextResponse.json({ error: 'Unknown table' }, { status: 404 });
      }
      return attachment(
        tableToCsv(table),
        exportFilename(snapshot, table.key.replace(/\./g, '-'), 'csv'),
        'text/csv; charset=utf-8',
      );
    }

    return attachment(
      snapshotToTidyCsv(snapshot),
      exportFilename(snapshot, 'analytics', 'csv'),
      'text/csv; charset=utf-8',
    );
  } catch (error) {
    console.error('Statistics export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
