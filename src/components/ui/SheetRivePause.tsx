'use client';

import { useEffect } from 'react';
import { useSheetStore } from '@/lib/sheetStore';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';

/**
 * While any sheet/popup is open, hold the global Rive interaction pause so
 * ambient animations covered by the backdrop (idle flies, card flies) stop
 * burning frames. Rives rendered inside the sheet itself don't subscribe to
 * this store, so they keep playing. Mounted once in the root layout.
 */
export function SheetRivePause() {
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  useEffect(() => {
    if (!anySheetOpen) return;
    const { acquire, release } = useRiveInteractionPause.getState();
    acquire();
    return release;
  }, [anySheetOpen]);
  return null;
}
