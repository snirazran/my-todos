'use client';

import type { AnalyticsEventName } from '@/lib/analytics/events';
import { PIXEL_EVENTS, pixelParams } from '@/lib/adpixels/map';
import { META_PIXEL_ID, TIKTOK_PIXEL_ID } from '@/lib/adpixels/config';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (...args: unknown[]) => void };
  }
}

type QueuedEvent = {
  name: AnalyticsEventName;
  properties?: Record<string, unknown>;
  eventId: string;
  meta: boolean;
  tiktok: boolean;
};

const RETRY_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 50;

const queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let attempts = 0;

function deliver(entry: QueuedEvent): boolean {
  const mapping = PIXEL_EVENTS[entry.name];
  if (!mapping) return true;
  const { meta, tiktok } = pixelParams(entry.name, entry.properties);

  if (entry.meta && typeof window.fbq === 'function') {
    try {
      window.fbq('track', mapping.meta, meta, { eventID: entry.eventId });
    } catch {}
    entry.meta = false;
  }
  if (entry.tiktok && typeof window.ttq?.track === 'function') {
    try {
      window.ttq.track(mapping.tiktok, tiktok, { event_id: entry.eventId });
    } catch {}
    entry.tiktok = false;
  }
  return !entry.meta && !entry.tiktok;
}

function pump() {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (deliver(queue[i])) queue.splice(i, 1);
  }
  if (queue.length === 0 || attempts >= MAX_ATTEMPTS) {
    if (timer) clearInterval(timer);
    timer = undefined;
    queue.length = 0;
    return;
  }
  attempts += 1;
}

export function trackAdPixels(
  name: AnalyticsEventName,
  properties: Record<string, unknown> | undefined,
  eventId: string,
) {
  if (typeof window === 'undefined') return;
  const mapping = PIXEL_EVENTS[name];
  if (!mapping) return;

  const entry: QueuedEvent = {
    name,
    properties,
    eventId,
    meta: Boolean(mapping.meta && META_PIXEL_ID),
    tiktok: Boolean(mapping.tiktok && TIKTOK_PIXEL_ID),
  };
  if (deliver(entry)) return;

  queue.push(entry);
  if (!timer) {
    attempts = 0;
    timer = setInterval(pump, RETRY_INTERVAL_MS);
  }
}
