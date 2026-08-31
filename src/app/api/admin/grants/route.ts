import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  applyGrant,
  listGrants,
  GrantError,
  GRANT_LIMITS,
  REASON_MAX,
} from '@/lib/admin/grants';
import type { GrantKind } from '@/lib/models/AdminGrant';

export const dynamic = 'force-dynamic';

function fail(error: unknown) {
  if (error instanceof GrantError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  const status = message.startsWith('Forbidden') ? 403 : 401;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const params = req.nextUrl.searchParams;
    const grants = await listGrants({
      userId: params.get('userId')?.trim() || undefined,
      limit: Number(params.get('limit')) || 25,
    });
    return NextResponse.json(
      { grants, limits: GRANT_LIMITS, reasonMax: REASON_MAX },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { grant, duplicate } = await applyGrant(
      {
        requestId: String(body?.requestId ?? ''),
        userId: String(body?.userId ?? ''),
        kind: body?.kind as GrantKind,
        amount: Number(body?.amount),
        itemId: body?.itemId ? String(body.itemId) : undefined,
        reason: String(body?.reason ?? ''),
      },
      { uid: admin.uid, email: admin.email ?? '' },
    );
    return NextResponse.json({ grant, duplicate });
  } catch (error) {
    console.error('[admin-grants] apply failed:', error);
    return fail(error);
  }
}
