import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { runAttributionResolver } from '@/lib/attribution/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const report = await runAttributionResolver({ force: true, backfillLimit: 2000, checkLimit: 150 });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Attribution resolve failed:', error);
    return NextResponse.json({ error: 'Attribution could not be resolved' }, { status: 500 });
  }
}
