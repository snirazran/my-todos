export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  ensureAppCalendar,
  exchangeCode,
  verifyState,
} from '@/lib/googleCalendar';

function backToApp(origin: string, params: Record<string, string>) {
  const url = new URL('/', origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');

  if (oauthError) return backToApp(origin, { calendar: 'denied' });

  const uid = state ? verifyState(state) : null;
  if (!uid || !code) return backToApp(origin, { calendar: 'error' });

  try {
    await connectMongo();
    const tokens = await exchangeCode(origin, code);

    const existing = await UserModel.findById(uid)
      .select('googleCalendar')
      .lean();
    const refreshToken =
      tokens.refresh_token ?? existing?.googleCalendar?.refreshToken;
    if (!refreshToken) return backToApp(origin, { calendar: 'error' });

    await UserModel.updateOne(
      { _id: uid },
      {
        $set: {
          calendarSyncEnabled: true,
          'googleCalendar.refreshToken': refreshToken,
          'googleCalendar.accessToken': tokens.access_token,
          'googleCalendar.accessTokenExpiresAt': new Date(
            Date.now() + tokens.expires_in * 1000,
          ),
        },
        $unset: { calendarAccessToken: 1 },
      },
    );

    await ensureAppCalendar(
      uid,
      tokens.access_token,
      existing?.googleCalendar?.calendarId,
    );

    return backToApp(origin, { calendar: 'connected' });
  } catch (err) {
    console.error('Calendar OAuth callback failed:', err);
    return backToApp(origin, { calendar: 'error' });
  }
}
