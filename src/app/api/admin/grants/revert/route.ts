import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { revertGrant, GrantError } from '@/lib/admin/grants';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const grantId = String(body?.grantId ?? '').trim();
    if (!/^[a-f0-9]{24}$/i.test(grantId)) {
      return NextResponse.json({ error: 'Bad grant id' }, { status: 400 });
    }
    const grant = await revertGrant(grantId, {
      uid: admin.uid,
      email: admin.email ?? '',
    });
    return NextResponse.json({ grant });
  } catch (error) {
    console.error('[admin-grants] revert failed:', error);
    if (error instanceof GrantError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { error: message },
      { status: message.startsWith('Forbidden') ? 403 : 401 },
    );
  }
}
