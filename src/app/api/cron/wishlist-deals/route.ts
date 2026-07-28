export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runWishlistDealAlerts } from '@/lib/skins/wishlistAlerts';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Alerts anyone whose pinned wishlist item is on today's shelf.
 *
 * Safe to run often — every send is claimed against a per-day key first, so
 * repeated runs inside the same day are no-ops. Hourly is a good cadence: it
 * catches players whose local window opens at different times, and catches a
 * Plus reroll that lands their item mid-day.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWishlistDealAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
