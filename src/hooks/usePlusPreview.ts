'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import type { PlusPreviewState } from '@/lib/plus/preview';

export const PLUS_PREVIEW_KEY = '/api/plus/preview';

export type PlusPreviewPayload = {
  preview: PlusPreviewState;
  earned: { flies: number; rareItems: number };
};

export function usePlusPreview(): PlusPreviewState | null {
  const { user } = useAuth();
  const { data } = useSWR<{ plusPreview?: PlusPreviewState }>(
    user ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: true, focusThrottleInterval: 60_000 },
  );
  const preview = data?.plusPreview ?? null;
  const endsAt = preview?.phase === 'active' ? preview.endsAt : null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const left = new Date(endsAt).getTime() - Date.now();
    if (left <= 0 || left > 2_000_000_000) return;
    const timer = window.setTimeout(() => {
      setTick((tick) => tick + 1);
      void mutate('/api/user');
    }, left + 1000);
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  if (preview && endsAt && Date.now() >= new Date(endsAt).getTime()) {
    return { ...preview, phase: 'ended' };
  }
  return preview;
}

export async function postPlusPreview(
  action: 'start' | 'end_seen',
): Promise<PlusPreviewPayload | null> {
  try {
    const res = await fetch(PLUS_PREVIEW_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as PlusPreviewPayload;
    void mutate(PLUS_PREVIEW_KEY, payload, { revalidate: false });
    return payload;
  } catch {
    return null;
  }
}

export async function fetchPlusPreview(url: string): Promise<PlusPreviewPayload> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Plus preview failed (${res.status})`);
  return res.json();
}
