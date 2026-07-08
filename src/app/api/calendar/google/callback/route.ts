export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import UserModel from '@/lib/models/User';
import { encryptSecret, verifyStateToken } from '@/lib/calendar/crypto';
import { exchangeCodeForTokens } from '@/lib/calendar/google/client';
import { invalidateConnectionCache } from '@/lib/calendar/connections';
import { notifyTaskChanged } from '@/lib/taskSync';

function resultPage(title: string, message: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f8f6;color:#1a2b1a}main{text-align:center;padding:32px;max-width:420px}h1{font-size:22px;margin-bottom:8px}p{font-size:15px;line-height:1.5;color:#4a5d4a}</style></head><body><main><h1>${title}</h1><p>${message}</p></main><script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const error = params.get('error');
  if (error) {
    return resultPage('Connection cancelled', 'You can close this window and try again from the app.');
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return resultPage('Something went wrong', 'Missing authorization details. Please try again from the app.');
  }

  const payload = verifyStateToken<{ uid?: string; purpose?: string }>(state);
  if (payload?.purpose !== 'gcal-callback' || !payload.uid) {
    return resultPage('Something went wrong', 'This connection link expired. Please try again from the app.');
  }
  const uid = payload.uid;

  try {
    const tokens = await exchangeCodeForTokens(code);
    await connectMongo();
    await CalendarConnectionModel.findOneAndUpdate(
      { userId: uid, provider: 'google' },
      {
        $set: {
          status: 'active',
          encRefreshToken: encryptSecret(tokens.refreshToken),
          calendarId: 'primary',
          calendarDisplayName: 'Primary calendar',
          settings: { exportEnabled: true, importEnabled: true },
        },
        $unset: { errorMessage: 1, syncToken: 1 },
      },
      { upsert: true, new: true },
    );
    await UserModel.updateOne(
      { _id: uid },
      { $set: { calendarSyncEnabled: true }, $unset: { calendarAccessToken: 1 } },
    );
    invalidateConnectionCache(uid);

    void (async () => {
      try {
        const conn = await CalendarConnectionModel.findOne({
          userId: uid,
          provider: 'google',
        });
        if (!conn) return;
        const { googleInitialSync } = await import('@/lib/calendar/google/sync');
        await googleInitialSync(conn);
        await notifyTaskChanged(uid);
      } catch (err) {
        console.error('google initial sync failed:', (err as Error)?.message);
      }
    })();

    return resultPage('Google Calendar connected', 'Your calendar is syncing. You can close this window and return to the app.');
  } catch (err) {
    console.error('google oauth callback failed:', (err as Error)?.message);
    return resultPage('Connection failed', 'We could not connect your Google Calendar. Please try again from the app.');
  }
}
