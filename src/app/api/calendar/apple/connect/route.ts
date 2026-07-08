export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import {
  AppleAuthError,
  createAppleClient,
  listVEventCalendars,
} from '@/lib/calendar/apple/client';

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  void uid;

  const body = await req.json().catch(() => ({}));
  const appleId = String(body.appleId ?? '').trim();
  const appPassword = String(body.appPassword ?? '').replace(/\s/g, '');
  if (!appleId || !appPassword) {
    return NextResponse.json(
      { error: 'Apple ID and app-specific password are required' },
      { status: 400 },
    );
  }

  try {
    const client = await createAppleClient(appleId, appPassword);
    const calendars = await listVEventCalendars(client);
    if (calendars.length === 0) {
      return NextResponse.json(
        { error: 'No calendars found on this iCloud account' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, calendars });
  } catch (err) {
    if (err instanceof AppleAuthError) {
      return NextResponse.json(
        {
          error:
            'Sign-in failed. Check your Apple ID and app-specific password (generate one at appleid.apple.com).',
        },
        { status: 401 },
      );
    }
    console.error('apple connect failed:', (err as Error)?.message);
    return NextResponse.json(
      { error: 'Could not reach iCloud. Please try again.' },
      { status: 502 },
    );
  }
}
