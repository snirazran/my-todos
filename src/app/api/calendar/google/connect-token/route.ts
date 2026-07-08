export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { signStateToken } from '@/lib/calendar/crypto';

const TOKEN_TTL_MS = 10 * 60 * 1000;

export async function POST() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = signStateToken({ uid, purpose: 'gcal-connect' }, TOKEN_TTL_MS);
  return NextResponse.json({ token });
}
