import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { excludeUserFromStats, includeUserInStats } from '@/lib/analytics/statsExclusion';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { id?: unknown; exclude?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id || typeof body.exclude !== 'boolean') {
    return NextResponse.json({ error: 'Missing id or exclude' }, { status: 400 });
  }

  await connectMongo();
  const exists = await UserModel.exists({ _id: id });
  if (!exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (body.exclude) await excludeUserFromStats(id);
  else await includeUserInStats(id);

  return NextResponse.json(
    { ok: true, excludedFromStats: body.exclude },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
