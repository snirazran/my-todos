'use client';

import { Suspense, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';

function WardrobePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frogRef = useRef<FrogHandle>(null);
  const { data } = useInventory(true);
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
    <main className="relative min-h-[100dvh] md:min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="relative z-10 flex flex-1 flex-col w-full min-h-[100dvh] md:min-h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4 md:px-6">
        <div className="relative z-40 flex shrink-0 items-end justify-center pointer-events-none h-[calc(204px+env(safe-area-inset-top))] md:h-[calc(222px+env(safe-area-inset-top))]">
          <div className="relative z-50 translate-y-[72px] pointer-events-none md:translate-y-[5.15rem]">
            <Frog
              ref={frogRef}
              mouthOpen={false}
              indices={previewIndices}
              paused={false}
            />
          </div>
        </div>

        <section className="relative z-10 flex flex-col flex-1 px-4 -mx-4 md:-mx-6 md:px-6">
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
