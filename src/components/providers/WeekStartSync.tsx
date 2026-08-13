'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useUIStore } from '@/lib/uiStore';
import { localeWeekStart, normalizeWeekStart } from '@/lib/weekStart';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * The stored choice is the source of truth across devices; the persisted store
 * only avoids a first-paint flicker. A user who has never chosen inherits their
 * device's convention rather than a hardcoded default.
 */
export function WeekStartSync() {
  const setWeekStartsOn = useUIStore((state) => state.setWeekStartsOn);
  const { data } = useSWR<{ weekStartsOn?: number }>('/api/user', fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    if (data.weekStartsOn === undefined || data.weekStartsOn === null) {
      setWeekStartsOn(localeWeekStart());
      return;
    }
    setWeekStartsOn(normalizeWeekStart(data.weekStartsOn));
  }, [data, setWeekStartsOn]);

  return null;
}
