'use client';

import { Gift } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { giftPreviewIndices } from '@/lib/friends/social';

type PreviewItem = { slot: string; riveIndex: number };

/** Grids share static frames; Rive initialization waits for the sheet to settle. */
export function GiftOutfitPreview({ item, ready }: { item?: PreviewItem | null; ready: boolean }) {
  if (!item || (item.slot === 'container' && !ready)) {
    return <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Gift className="h-7 w-7" aria-hidden /></span>;
  }
  return (
    <span className="flex h-full w-full items-center justify-center overflow-hidden">
      {item.slot === 'container' ? (
        <GiftRive width={150} height={150} color={item.riveIndex} isMilestone={false} paused />
      ) : (
        <FrogSnapshot width="100%" height="100%" indices={giftPreviewIndices(item)} visualOffsetY={0} cachedOnly={!ready} />
      )}
    </span>
  );
}
