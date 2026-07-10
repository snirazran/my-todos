import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  ANALYTICS_EVENT_SET,
  type AnalyticsEventName,
  type AnalyticsPlatform,
} from '@/lib/analytics/events';

const CLIENT_EVENTS = new Set([
  'app_opened',
  'page_viewed',
  'ad_requested',
  'ad_impression',
  'ad_completed',
  'ad_dismissed',
  'ad_failed',
  'paywall_viewed',
  'paywall_step_viewed',
  'purchase_started',
  'purchase_completed',
  'purchase_cancelled',
  'purchase_failed',
  'try_funnel_viewed',
  'try_task_completed',
  'try_gift_opened',
  'try_signin_started',
  'try_signup_completed',
  'try_gift_claimed',
  'try_cosmetic_previewed',
  'try_continued',
  'try_store_clicked',
  'fly_shop_viewed',
  'fly_pack_selected',
  'fly_pack_purchase_started',
  'fly_pack_purchase_cancelled',
  'fly_pack_purchase_failed',
  'referral_invite_shared',
  'referral_invite_opened',
  'friend_link_shared',
  'friend_link_opened',
]);

function inferPlatform(req: NextRequest): AnalyticsPlatform {
  const requested = req.headers.get('x-frogress-platform');
  if (requested === 'ios' || requested === 'android' || requested === 'web') return requested;
  const ua = req.headers.get('user-agent')?.toLowerCase() ?? '';
  if (ua.includes('frogress') && ua.includes('android')) return 'android';
  if (ua.includes('frogress') && (ua.includes('iphone') || ua.includes('ipad'))) return 'ios';
  return 'web';
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const anonymousId =
    typeof body.anonymousId === 'string' && /^[0-9a-f-]{36}$/i.test(body.anonymousId)
      ? body.anonymousId
      : undefined;
  let userId: string;
  let authenticated = true;
  try {
    userId = await requireUserId();
  } catch {
    authenticated = false;
    if (!anonymousId) return new NextResponse(null, { status: 204 });
    userId = `anonymous:${anonymousId}`;
  }

  const name = typeof body.name === 'string' ? body.name : '';
  if (!ANALYTICS_EVENT_SET.has(name)) {
    return NextResponse.json({ error: 'Unknown analytics event' }, { status: 400 });
  }
  if (!CLIENT_EVENTS.has(name)) {
    return NextResponse.json({ error: 'Server analytics event required' }, { status: 400 });
  }
  if (
    !authenticated &&
    name !== 'app_opened' &&
    name !== 'page_viewed' &&
    !name.startsWith('try_') &&
    name !== 'referral_invite_opened' &&
    name !== 'friend_link_opened'
  ) {
    return new NextResponse(null, { status: 204 });
  }

  await recordAnalyticsEvent({
    userId,
    name: name as AnalyticsEventName,
    source: 'client',
    platform: inferPlatform(req),
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    anonymousId,
    properties:
      body.properties && typeof body.properties === 'object'
        ? (body.properties as Record<string, unknown>)
        : undefined,
  });

  return new NextResponse(null, { status: 204 });
}
