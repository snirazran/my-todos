export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { loadLeapConfig, saveLeapConfig, clearLeapConfigCache } from '@/lib/leap/config';
import { LEAP_DEFAULTS } from '@/lib/models/LeapConfig';

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  clearLeapConfigCache();
  const [config, catalog] = await Promise.all([loadLeapConfig(), getFullCatalog()]);
  return NextResponse.json({ config, defaults: LEAP_DEFAULTS, catalog });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const config = await saveLeapConfig(body);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 400 },
    );
  }
}
