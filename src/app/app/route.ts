import { NextRequest, NextResponse } from 'next/server';
import { WEB_APP_URL, storeUrlForDevice } from '@/lib/appStores';

export function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  const target = storeUrlForDevice(ua) ?? WEB_APP_URL;
  return NextResponse.redirect(target, 302);
}
