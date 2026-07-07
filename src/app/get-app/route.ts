import { NextRequest, NextResponse } from 'next/server';
import { APP_STORE_URL, storeUrlForDevice } from '@/lib/appStores';

// Device-aware store redirect. Scanned from the desktop QR code and safe to
// use anywhere a single "download the app" link is needed.
export function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  const store = storeUrlForDevice(ua) ?? APP_STORE_URL;
  return NextResponse.redirect(store, 302);
}
