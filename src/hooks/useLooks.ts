'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import {
  mutateInventoryCaches,
  mutateInventorySummary,
} from '@/hooks/useInventory';
import { mutateBackgrounds } from '@/hooks/useBackgrounds';
import { hapticImpact, hapticSuccess, hapticTick } from '@/lib/haptics';
import { SAVED_LOOKS_FREE, type SavedLookView } from '@/lib/skins/looks';

const LOOKS_KEY = '/api/skins/looks';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LooksResponse = {
  looks: SavedLookView[];
  max: number;
  isPremium?: boolean;
};

export function useLooks(enabled: boolean = true) {
  const { data, mutate } = useSWR<LooksResponse>(
    enabled ? LOOKS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState(false);

  const looks = data?.looks ?? [];
  const max = data?.max ?? SAVED_LOOKS_FREE;
  const isPremium = !!data?.isPremium;
  const isFull = looks.length >= max;

  const save = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (busy) return { ok: false };
    setBusy(true);
    hapticImpact();
    try {
      const res = await fetch(LOOKS_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: payload?.error };
      hapticSuccess();
      await mutate();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not save this look.' };
    } finally {
      setBusy(false);
    }
  }, [busy, mutate]);

  const apply = useCallback(
    async (lookId: string) => {
      if (busy) return false;
      setBusy(true);
      hapticImpact();
      try {
        const res = await fetch(LOOKS_KEY, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lookId }),
        });
        if (!res.ok) return false;
        mutateInventoryCaches();
        mutateInventorySummary();
        mutateBackgrounds();
        window.dispatchEvent(new Event('wardrobe-refresh'));
        window.dispatchEvent(new Event('background-refresh'));
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const remove = useCallback(
    async (lookId: string) => {
      hapticTick();
      mutate(
        (curr) =>
          curr
            ? { ...curr, looks: curr.looks.filter((l) => l.id !== lookId) }
            : curr,
        { revalidate: false },
      );
      try {
        await fetch(LOOKS_KEY, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lookId }),
        });
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  return {
    looks,
    max,
    isPremium,
    isFull,
    busy,
    save,
    apply,
    remove,
    refresh: mutate,
  };
}
