import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { parseSpendReport } from '@/lib/attribution/spendImport';
import { deleteSpendImport, importSpend, listSpendImports } from '@/lib/attribution/spend';
import { SPEND_CHANNELS } from '@/lib/attribution/classify';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CHANNEL_IDS = new Set<string>(SPEND_CHANNELS.map((channel) => channel.id));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const imports = await listSpendImports();
  return NextResponse.json({ imports }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const channel = typeof body.channel === 'string' ? body.channel : '';
  if (!CHANNEL_IDS.has(channel)) {
    return NextResponse.json({ error: 'Pick the ad network this report came from.' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.length > 5_000_000) {
    return NextResponse.json({ error: 'The report is too large. Split it by date range.' }, { status: 400 });
  }

  const parsed = parseSpendReport(text);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  if (body.preview) {
    return NextResponse.json(
      {
        preview: {
          level: parsed.level,
          hasDate: parsed.hasDate,
          meta: parsed.meta,
          campaigns: parsed.campaigns,
          dateRange: parsed.dateRange,
          columns: parsed.columns,
          warnings: parsed.warnings,
          totals: parsed.totals,
          rows: parsed.rows.length,
          sample: parsed.rows.slice(0, 8),
        },
      },
      { headers: NO_STORE },
    );
  }

  const start = typeof body.start === 'string' && DAY.test(body.start) ? body.start : undefined;
  const end = typeof body.end === 'string' && DAY.test(body.end) ? body.end : undefined;

  try {
    const result = await importSpend({
      channel,
      parsed,
      start,
      end,
      label: typeof body.label === 'string' ? body.label : undefined,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const batch = req.nextUrl.searchParams.get('batch');
  if (!batch) return NextResponse.json({ error: 'Missing batch' }, { status: 400 });
  await deleteSpendImport(batch);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
