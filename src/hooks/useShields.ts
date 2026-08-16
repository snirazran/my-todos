'use client';

import useSWR, { mutate as mutateGlobal } from 'swr';
import type { ShieldOffer, ShieldView } from '@/lib/shields/types';

type ShieldResponse = { shields: ShieldView; flyBalance: number };

function clientTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function shieldsKey() {
  return `/api/shields?timezone=${encodeURIComponent(clientTimezone())}`;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => r.json());

export function useShields(enabled: boolean = true) {
  const { data, isLoading } = useSWR<ShieldResponse>(
    enabled ? shieldsKey() : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    shields: data?.shields ?? null,
    flyBalance: data?.flyBalance ?? 0,
    isLoading,
  };
}

export function revalidateShields() {
  return mutateGlobal(shieldsKey());
}

export function patchShieldView(shields: ShieldView, flyBalance?: number) {
  mutateGlobal(
    shieldsKey(),
    (curr: ShieldResponse | undefined) => ({
      shields,
      flyBalance: flyBalance ?? curr?.flyBalance ?? 0,
    }),
    { revalidate: false },
  );
}

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/shields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ timezone: clientTimezone(), ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, payload } as {
    ok: boolean;
    payload: Partial<ShieldResponse> & { error?: string };
  };
}

export function buyShields(quantity: 1 | 2) {
  return post({ action: 'buy', quantity });
}

/**
 * Records that an auto-opened offer was closed without buying. Manual opens
 * must never call this — a user who went looking for the sheet has not said no
 * to anything, and counting it would mute the offer they were interested in.
 */
export function dismissShieldOffer() {
  return post({ action: 'dismiss' });
}

/* --- Cross-tree request channel, mirroring the streak sheet's --- */

let sheetListener: ((offer: ShieldOffer | null) => void) | null = null;
let pending: { offer: ShieldOffer | null } | null = null;

export function openShieldSheet(offer: ShieldOffer | null = null) {
  if (sheetListener) sheetListener(offer);
  else pending = { offer };
}

export function subscribeShieldSheet(cb: (offer: ShieldOffer | null) => void) {
  sheetListener = cb;
  if (pending) {
    const req = pending;
    pending = null;
    cb(req.offer);
  }
  return () => {
    if (sheetListener === cb) sheetListener = null;
  };
}
