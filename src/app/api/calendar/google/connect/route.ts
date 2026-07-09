export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import {
  buildAuthUrl,
  oauthConfigured,
  signState,
} from '@/lib/googleCalendar';

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.redirect(new URL('/login', req.nextUrl.origin));
  }

  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Calendar OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_SECRET (and optionally GOOGLE_OAUTH_CLIENT_ID) in the environment.',
      },
      { status: 500 },
    );
  }

  return NextResponse.redirect(
    buildAuthUrl(req.nextUrl.origin, signState(uid)),
  );
}
