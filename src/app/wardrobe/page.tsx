'use client';

import { useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';

export default function WardrobePage() {
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
    <main className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <div className="flex flex-col w-full h-full max-w-3xl gap-0 px-4 pt-0 pb-4 mx-auto md:px-6 md:pb-6 md:pt-4">
        <section className="z-20 flex flex-col pointer-events-none shrink-0">
          <div className="flex items-start justify-center">
            <div className="scale-[0.78] origin-top pointer-events-none lg:scale-90">
              <Frog
                ref={frogRef}
                mouthOpen={false}
                indices={previewIndices}
                paused={false}
              />
            </div>
          </div>
        </section>

        <section className="relative z-10 flex flex-col flex-1 min-h-0 -mt-12 md:-mt-[4.20rem] lg:-mt-12">
          <WardrobePageContent
            defaultTab={defaultTab}
            onClose={() => router.push('/')}
          />
        </section>
      </div>
    </main>
  );
}
