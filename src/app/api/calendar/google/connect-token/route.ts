export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { signStateToken } from '@/lib/calendar/crypto';
import { isSyncDirection } from '@/lib/calendar/direction';

const TOKEN_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const direction = isSyncDirection(body?.direction) ? body.direction : 'two_way';
  try {
    const token = signStateToken(
      { uid, purpose: 'gcal-connect', direction },
      TOKEN_TTL_MS,
    );
    return NextResponse.json({ token });
  } catch (err) {
    console.error('calendar connect-token not configured:', (err as Error)?.message);
    return NextResponse.json({ error: 'calendar sync not configured' }, { status: 503 });
  }
}
