import { NextRequest, NextResponse } from 'next/server';
import { syncPremiumFromRevenueCat } from '@/lib/revenuecat';

export async function POST(req: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error('REVENUECAT_WEBHOOK_AUTH is not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: any;
  try {
    const body = await req.json();
    event = body?.event;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const appUserId: string | undefined = event?.app_user_id;
  const candidates = [
    appUserId,
    ...(Array.isArray(event?.aliases) ? event.aliases : []),
  ].filter(
    (id): id is string =>
      typeof id === 'string' && id.length > 0 && !id.startsWith('$RCAnonymousID:'),
  );
  const userId = candidates[0];
  if (!userId) {
    return NextResponse.json({ ok: true, skipped: 'anonymous user' });
  }

  try {
    await syncPremiumFromRevenueCat(userId);
  } catch (error) {
    console.error('RevenueCat webhook sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
