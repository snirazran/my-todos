import crypto from 'node:crypto';
import type { AdIdentity } from '@/lib/types/UserDoc';

const META_GRAPH_VERSION = 'v23.0';
const REQUEST_TIMEOUT_MS = 5000;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN ?? '';
const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? '';
const TIKTOK_EVENTS_TOKEN = process.env.TIKTOK_EVENTS_TOKEN ?? '';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const META_TEST_CODE = process.env.META_TEST_EVENT_CODE ?? '';
const TIKTOK_TEST_CODE = process.env.TIKTOK_TEST_EVENT_CODE ?? '';

function testCodeFor(configured: string, test?: boolean): string {
  if (test) return configured;
  return IS_PRODUCTION ? '' : configured;
}

function hash(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function prune<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

export type AdConversion = {
  metaEvent?: string;
  tiktokEvent?: string;
  eventId: string;
  eventTime: Date;
  userId: string;
  email?: string;
  identity?: AdIdentity;
  actionSource: 'website' | 'other';
  test?: boolean;
  value?: number;
  currency?: string;
  contentId?: string;
};

async function sendMeta(input: AdConversion) {
  if (!input.metaEvent) return;
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return;
  const testCode = testCodeFor(META_TEST_CODE, input.test);
  if (input.test && !testCode) return;
  const { identity } = input;
  const emailHash = hash(input.email);
  if (!identity?.fbp && !identity?.fbc && !emailHash) return;

  const payload = {
    data: [
      prune({
        event_name: input.metaEvent,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        action_source: input.actionSource,
        user_data: prune({
          em: emailHash ? [emailHash] : undefined,
          external_id: hash(input.userId),
          fbp: identity?.fbp,
          fbc: identity?.fbc,
          client_ip_address: identity?.ip,
          client_user_agent: identity?.userAgent,
        }),
        custom_data: prune({
          value: input.value,
          currency: input.value !== undefined ? input.currency ?? 'USD' : undefined,
          content_type: input.contentId ? 'product' : undefined,
          content_ids: input.contentId ? [input.contentId] : undefined,
        }),
      }),
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    console.error('Meta CAPI rejected event:', input.metaEvent, await res.text());
  }
}

async function sendTikTok(input: AdConversion) {
  if (!input.tiktokEvent) return;
  if (!TIKTOK_PIXEL_ID || !TIKTOK_EVENTS_TOKEN) return;
  const testCode = testCodeFor(TIKTOK_TEST_CODE, input.test);
  if (input.test && !testCode) return;
  const { identity } = input;
  const emailHash = hash(input.email);
  if (!identity?.ttp && !identity?.ttclid && !emailHash) return;

  const payload = {
    event_source: 'web',
    event_source_id: TIKTOK_PIXEL_ID,
    ...(testCode ? { test_event_code: testCode } : {}),
    data: [
      prune({
        event: input.tiktokEvent,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        user: prune({
          email: emailHash,
          external_id: hash(input.userId),
          ttp: identity?.ttp,
          ttclid: identity?.ttclid,
          ip: identity?.ip,
          user_agent: identity?.userAgent,
        }),
        properties: prune({
          value: input.value,
          currency: input.value !== undefined ? input.currency ?? 'USD' : undefined,
          content_type: input.contentId ? 'product' : undefined,
          contents: input.contentId
            ? [{ content_id: input.contentId, quantity: 1, price: input.value }]
            : undefined,
        }),
      }),
    ],
  };

  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': TIKTOK_EVENTS_TOKEN,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
  if (!res.ok || (json?.code !== undefined && json.code !== 0)) {
    console.error('TikTok Events API rejected event:', input.tiktokEvent, json?.message);
  }
}

export async function sendAdConversion(input: AdConversion) {
  if (input.identity?.consent === 'denied') return;
  await Promise.allSettled([sendMeta(input), sendTikTok(input)]);
}
