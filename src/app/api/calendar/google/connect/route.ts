export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { signStateToken, verifyStateToken } from '@/lib/calendar/crypto';
import { googleConsentUrl } from '@/lib/calendar/google/client';

const STATE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  let uid: string | null = null;

  const nativeToken = req.nextUrl.searchParams.get('t');
  if (nativeToken) {
    const payload = verifyStateToken<{ uid?: string; purpose?: string }>(nativeToken);
    if (payload?.purpose === 'gcal-connect' && payload.uid) uid = payload.uid;
  } else {
    try {
      uid = await requireUserId();
    } catch {
      uid = null;
    }
  }

  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = signStateToken({ uid, purpose: 'gcal-callback' }, STATE_TTL_MS);
  return NextResponse.redirect(googleConsentUrl(state));
}
