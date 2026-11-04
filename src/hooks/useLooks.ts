'use client';

import { useCallback, useState } from 'react';
import useSWR, { mutate as mutateGlobal } from 'swr';
import {
  INVENTORY_KEY,
  INVENTORY_SUMMARY_KEY,
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
  mutateInventorySummary,
} from '@/hooks/useInventory';
import { BACKGROUNDS_KEY, mutateBackgrounds } from '@/hooks/useBackgrounds';
import { hapticImpact, hapticSuccess, hapticTick } from '@/lib/haptics';
import { LOOK_SLOTS, SAVED_LOOKS_FREE, type SavedLookView } from '@/lib/skins/looks';

let applyQueue: Promise<unknown> = Promise.resolve();

function wearLookLocally(look: SavedLookView) {
  const equipped: Record<string, string | null> = {};
  for (const slot of LOOK_SLOTS) equipped[slot] = look.equipped[slot] ?? null;
  const patchInventory = (curr: any) =>
    curr?.wardrobe
      ? {
          ...curr,
          wardrobe: {
            ...curr.wardrobe,
            equipped: { ...curr.wardrobe.equipped, ...equipped },
          },
        }
      : curr;
  void mutateGlobal(INVENTORY_KEY, patchInventory, { revalidate: false });
  void mutateGlobal(INVENTORY_SUMMARY_KEY, patchInventory, { revalidate: false });
  if (look.backgroundId) {
    void mutateGlobal(
      BACKGROUNDS_KEY,
      (curr: any) => (curr ? { ...curr, equipped: look.backgroundId } : curr),
      { revalidate: false },
    );
  }
}

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

  const save = useCallback(async (name?: string): Promise<{
    ok: boolean;
    error?: string;
    look?: SavedLookView;
    atCap?: boolean;
  }> => {
    if (busy) return { ok: false };
    setBusy(true);
    hapticImpact();
    try {
      const res = await fetch(LOOKS_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: payload?.error, atCap: !!payload?.atCap };
      hapticSuccess();
      await mutate();
      return { ok: true, look: payload?.look };
    } catch {
      return { ok: false, error: 'Could not save this look.' };
    } finally {
      setBusy(false);
    }
  }, [busy, mutate]);

  const rename = useCallback(
    async (lookId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      mutate(
        (curr) =>
          curr
            ? {
                ...curr,
                looks: curr.looks.map((look) =>
                  look.id === lookId ? { ...look, name: trimmed } : look,
                ),
              }
            : curr,
        { revalidate: false },
      );
      try {
        const res = await fetch(LOOKS_KEY, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lookId, name: trimmed }),
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  const apply = useCallback(
    async (lookId: string) => {
      const look = data?.looks.find((entry) => entry.id === lookId);
      if (!look) return false;
      hapticImpact();
      wearLookLocally(look);
      beginEquipMutation();
      const request = applyQueue.then(() =>
        fetch(LOOKS_KEY, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lookId }),
        }).then((res) => res.ok),
      );
      applyQueue = request.catch(() => false);
      const ok = await request.catch(() => false);
      const settled = endEquipMutation() === 0;
      if (!ok) {
        mutateInventoryCaches();
        mutateBackgrounds();
        return false;
      }
      if (settled) {
        mutateInventorySummary();
        window.dispatchEvent(new Event('wardrobe-refresh'));
        window.dispatchEvent(new Event('background-refresh'));
      }
      return true;
    },
    [data?.looks],
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
    rename,
    apply,
    remove,
    refresh: mutate,
  };
}
