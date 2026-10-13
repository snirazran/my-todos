'use client';

import useSWR from 'swr';
import { leapViewKey } from '@/lib/leap/viewKey';
import type { LeapView } from '@/lib/leap/types';

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Could not load Leap');
    return res.json();
  });

export function useLeapView(enabled = true) {
  return useSWR<LeapView>(enabled ? leapViewKey() : null, fetcher, {
    revalidateOnFocus: false,
  });
}

export async function patchLeap(body: Record<string, unknown>) {
  await fetch('/api/leap', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}
