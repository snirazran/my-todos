import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildSnapshot } from '@/lib/analytics/report';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;

  try {
    const snapshot = await buildSnapshot({
      start: params.get('start'),
      end: params.get('end'),
      days: params.get('days') ? Number(params.get('days')) : null,
      compare: params.get('compare') === '1',
    });
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Statistics snapshot failed:', error);
    return NextResponse.json({ error: 'Statistics could not be built' }, { status: 500 });
  }
}
