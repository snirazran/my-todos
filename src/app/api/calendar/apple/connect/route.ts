export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import {
  AppleAuthError,
  createAppleClient,
  listVEventCalendars,
} from '@/lib/calendar/apple/client';
import { encryptSecret } from '@/lib/calendar/crypto';
import { invalidateConnectionCache } from '@/lib/calendar/connections';
import { notifyTaskChanged } from '@/lib/taskSync';

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    await connectMongo();
    await CalendarConnectionModel.findOneAndUpdate(
      { userId: uid, provider: 'apple' },
      {
        $set: {
          status: 'active',
          appleId,
          encAppPassword: encryptSecret(appPassword),
          settings: { exportEnabled: true, importEnabled: true },
        },
        $unset: { errorMessage: 1, appCalendarUrl: 1, calendarCtags: 1 },
      },
      { upsert: true },
    );
    invalidateConnectionCache(uid);

    void (async () => {
      try {
        const conn = await CalendarConnectionModel.findOne({
          userId: uid,
          provider: 'apple',
        });
        if (!conn) return;
        const { clearClientCache } = await import('@/lib/calendar/apple/client');
        clearClientCache(conn._id);
        const { appleInitialSync } = await import('@/lib/calendar/apple/sync');
        await appleInitialSync(conn);
        await notifyTaskChanged(uid);
      } catch (err) {
        console.error('apple initial sync failed:', (err as Error)?.message);
      }
    })();

    return NextResponse.json({ ok: true });
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
