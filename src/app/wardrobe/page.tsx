'use client';

import { useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';

export default function WardrobePage() {
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
    mobile: equippedBackground?.images?.mobile || '/bg-mobile.png',
    tablet: equippedBackground?.images?.tablet || '/bg-tablet.png',
    web: equippedBackground?.images?.web || '/bg-web.png',
    webLarge: equippedBackground?.images?.webLarge || '/bg-web-large.png',
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
    <main className="relative h-[100dvh] md:h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <picture
        key={equippedBackground?.id ?? 'default-bg'}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[243px] md:h-[263px] z-0"
      >
        {bgImages.webLarge && (
          <source media="(min-width: 1920px)" srcSet={bgImages.webLarge} />
        )}
        {bgImages.web && <source media="(min-width: 1280px)" srcSet={bgImages.web} />}
        {bgImages.tablet && (
          <source media="(min-width: 768px)" srcSet={bgImages.tablet} />
        )}
        <img
          src={bgImages.mobile}
          alt=""
          className="h-full w-full object-cover object-bottom"
        />
      </picture>
      <div className="relative z-10 flex flex-col w-full h-full max-w-3xl gap-0 px-4 pt-0 pb-4 mx-auto md:px-6 md:pb-6 md:pt-4">
        <section className="z-20 flex flex-col pointer-events-none shrink-0">
          <div className="flex items-start justify-center">
            <div className="origin-top scale-100 translate-y-5 pointer-events-none lg:translate-y-3 lg:scale-90">
              <Frog
                ref={frogRef}
                mouthOpen={false}
                indices={previewIndices}
                paused={false}
              />
            </div>
          </div>
        </section>

        <section className="relative z-10 -mx-4 mt-2 flex min-h-0 flex-1 flex-col rounded-t-[32px] bg-background px-4 pt-5 md:-mx-6 md:px-6 md:pt-6 lg:-mt-4">
          <WardrobePageContent
            defaultTab={defaultTab}
            onClose={() => router.push('/')}
          />
        </section>
      </div>
    </main>
  );
}
