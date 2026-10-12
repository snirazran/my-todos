import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { appleAdsSyncStatus, syncAppleAdsSpend } from '@/lib/attribution/appleAdsApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store' };

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
  return NextResponse.json(appleAdsSyncStatus(), { headers: NO_STORE });
}

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const result = await syncAppleAdsSpend();
    return NextResponse.json({ ok: true, result, status: appleAdsSyncStatus() }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed', status: appleAdsSyncStatus() },
      { status: 400, headers: NO_STORE },
    );
  }
}
