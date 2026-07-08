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

  try {
    const state = signStateToken({ uid, purpose: 'gcal-callback' }, STATE_TTL_MS);
    return NextResponse.redirect(googleConsentUrl(state));
  } catch (err) {
    console.error('calendar connect not configured:', (err as Error)?.message);
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Calendar sync unavailable</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f8f6;color:#1a2b1a}main{text-align:center;padding:32px;max-width:420px}h1{font-size:22px;margin-bottom:8px}p{font-size:15px;line-height:1.5;color:#4a5d4a}</style></head><body><main><h1>Calendar sync isn&rsquo;t available yet</h1><p>The server is missing its Google Calendar configuration. Please try again later.</p></main></body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
