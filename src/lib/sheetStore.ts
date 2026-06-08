'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Global count of open bottom sheets / popups.
 *
 * A couple of always-mounted components (the home page and the shared header)
 * read `count > 0` to pause their *background* Rive animations (the big frog,
 * idle flies, the fly counter) while any sheet is open — matching how Frogodoro
 * already pauses them. Rives rendered *inside* a sheet keep their own
 * `paused={false}`, and Gift Rives never read this, so neither pauses.
 *
 * This is read in only ~2 places (not per Rive leaf), so it can't cause a
 * render storm.
 */
interface SheetStore {
  count: number;
  open: () => void;
  close: () => void;
}

export const useSheetStore = create<SheetStore>((set) => ({
  count: 0,
  open: () => set((s) => ({ count: s.count + 1 })),
  close: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

/**
 * Register a sheet/popup as open while `open` is true, so background Rives
 * pause. BaseSheet calls this automatically; bespoke sheets call it too.
 */
export function useRegisterOpenSheet(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const { open: openSheet, close: closeSheet } = useSheetStore.getState();
    openSheet();
    return () => closeSheet();
  }, [open]);
}
