'use client';

import { Suspense, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { PageBackground } from '@/components/ui/PageBackground';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';

function WardrobePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frogRef = useRef<FrogHandle>(null);
  const { data } = useInventory(true);
  const { data: backgroundsData } = useBackgrounds(true);
  const equippedBackground = useMemo(() => {
    if (!backgroundsData?.equipped) return null;
    return (
      backgroundsData.catalog.find((b) => b.id === backgroundsData.equipped) ?? null
    );
  }, [backgroundsData]);
  const bgImages = {
    mobile: equippedBackground?.images?.mobile || '/bg-mobile.webp',
    tablet: equippedBackground?.images?.tablet || '/bg-tablet.webp',
    web: equippedBackground?.images?.web || '/bg-web.webp',
    webLarge: equippedBackground?.images?.webLarge || '/bg-web-large.webp',
  };
  const defaultTab =
    (searchParams.get('tab') as 'inventory' | 'shop' | 'trade') || 'inventory';

  const previewIndices = useMemo(() => {
    const catalogById = Object.fromEntries(
      (data?.catalog ?? []).map((item) => [item.id, item]),
    );
    const equipped = data?.wardrobe?.equipped ?? {};

    const getIndex = (slot: WardrobeSlot) => {
      const itemId = equipped[slot];
      if (!itemId) return 0;
      return (catalogById[itemId] ?? staticById[itemId])?.riveIndex ?? 0;
    };

    return {
      skin: getIndex('skin'),
      mood: 0,
      hat: getIndex('hat'),
      body: getIndex('body'),
      hand_item: getIndex('hand_item'),
    };
  }, [data?.catalog, data?.wardrobe?.equipped]);

  return (
    <main className="relative h-[100dvh] md:h-[calc(100vh-4rem)] overflow-hidden">
      <div className="relative z-10 flex flex-col w-full h-full max-w-3xl gap-0 px-4 pt-0 pb-4 mx-auto md:px-6 md:pb-6 md:pt-4">
        <section className="relative z-20 flex flex-col pointer-events-none shrink-0 min-h-[182px] md:min-h-[230px]">
          <div className="flex items-start justify-center">
            <div className="relative z-50 -mb-6 transition-transform duration-500 origin-top scale-100 pointer-events-none translate-y-6 md:mb-6 md:scale-100 md:-translate-y-2 lg:-translate-y-4">
              <Frog
                ref={frogRef}
                mouthOpen={false}
                indices={previewIndices}
                paused={false}
              />
            </div>
          </div>
        </section>

        <section className="relative z-10 -mx-4 mt-2 flex min-h-0 flex-1 flex-col rounded-t-[32px] bg-background px-4 pt-5 md:-mt-[72px] md:mx-[calc((100%-100vw)/2)] md:px-8 md:pt-6 lg:-mx-6 lg:-mt-[78px] lg:px-6">
          <WardrobePageContent
            defaultTab={defaultTab}
            onClose={() => router.push('/')}
          />
        </section>
      </div>
    </main>
  );
}

export default function WardrobePage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <WardrobePageInner />
    </Suspense>
  );
}
